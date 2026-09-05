/**
 * Live MongoDB integration tests for Phase 2O — Automated Defensive Response & Decision System.
 * Tests full end-to-end database persistence, tenant isolation, operational trace, and audit log.
 */

'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const mongoose = require('mongoose');
const app = require('../src/app');
const env = require('../src/config/env');
const { signAccessToken } = require('../src/utils/jwt');
const {
  Transaction,
  Merchant,
  Chargeback,
  Evidence,
  ChargebackResponse,
  AgentTrace,
  AuditLog,
} = require('../src/models');
const { hashPassword } = require('../src/utils/password');

const MONGODB_URI = process.env.MONGODB_URI || env.MONGODB_URI;

const TEST_JWT_SECRET = 'test-secret-key-for-riskyplay-cb-response-mongo-suite-12345';
env.JWT_SECRET = TEST_JWT_SECRET;
process.env.JWT_SECRET = TEST_JWT_SECRET;

describe('MONGODB LIVE INTEGRATION — CHARGEBACK DEFENSIVE RESPONSE & DECISION SYSTEM', () => {
  if (!MONGODB_URI || MONGODB_URI.trim() === '') {
    it.skip('Skipping live MongoDB response integration tests (MONGODB_URI is not configured)', () => {});
    return;
  }

  let server;
  let baseUrl;
  let merchantA;
  let merchantB;
  let tokenA;
  let tokenB;
  let txA;
  let cbA;
  let evA;

  before(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGODB_URI);
    }

    // Clean up test collections
    await Promise.all([
      Merchant.deleteMany({ email: { $in: ['cb-resp-a@example.com', 'cb-resp-b@example.com'] } }),
      Transaction.deleteMany({ externalTransactionId: 'TX-CB-RESP-A' }),
      Chargeback.deleteMany({ caseNumber: 'CB-RESP-CASE-A' }),
      ChargebackResponse.deleteMany({}),
      AgentTrace.deleteMany({ entityType: 'CHARGEBACK_REBUTTAL' }),
    ]);

    // Create 2 test merchants
    const passwordHash = await hashPassword('ResponsePass123!');
    merchantA = await Merchant.create({
      name: 'Response Merchant A',
      email: 'cb-resp-a@example.com',
      passwordHash,
      currency: 'USD',
    });

    merchantB = await Merchant.create({
      name: 'Response Merchant B',
      email: 'cb-resp-b@example.com',
      passwordHash,
      currency: 'USD',
    });

    tokenA = signAccessToken({ _id: merchantA._id.toString() });
    tokenB = signAccessToken({ _id: merchantB._id.toString() });

    // Seed transaction for Merchant A
    txA = await Transaction.create({
      merchantId: merchantA._id,
      externalTransactionId: 'TX-CB-RESP-A',
      amount: 199.99,
      currency: 'USD',
      status: 'APPROVED',
      customer: { email: 'buyer@example.com' },
      paymentMethod: { cardLast4: '4242' },
    });

    // Seed chargeback for Merchant A
    cbA = await Chargeback.create({
      merchantId: merchantA._id,
      transactionId: txA._id,
      caseNumber: 'CB-RESP-CASE-A',
      disputeAmount: 199.99,
      currency: 'USD',
      reasonCode: '10.4',
      reasonCategory: 'FRAUD',
      stage: 'FIRST_CHARGEBACK',
      network: 'VISA',
      deadlineDate: new Date(Date.now() + 86400000 * 7),
      status: 'OPEN',
    });

    // Seed evidence item for Merchant A
    evA = await Evidence.create({
      merchantId: merchantA._id,
      chargebackId: cbA._id,
      transactionId: txA._id,
      type: 'DELIVERY',
      title: 'Signed Delivery Proof',
      fileMetadata: {
        filename: 'proof_of_delivery.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 1024,
      },
      extractedFacts: [
        { key: 'trackingNumber', value: '1Z9999999999999999', confidence: 0.99, verified: true },
        { key: 'deliveryDate', value: '2026-08-10', confidence: 0.95, verified: true },
        { key: 'amount', value: 199.99, confidence: 1.0, verified: true },
      ],
      tags: ['shipping', 'carrier'],
    });

    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}/api/v1/chargebacks/${cbA._id}/response`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await Promise.all([
      Merchant.deleteMany({ email: { $in: ['cb-resp-a@example.com', 'cb-resp-b@example.com'] } }),
      Transaction.deleteMany({ externalTransactionId: 'TX-CB-RESP-A' }),
      Chargeback.deleteMany({ caseNumber: 'CB-RESP-CASE-A' }),
      Evidence.deleteMany({ chargebackId: cbA?._id }),
      ChargebackResponse.deleteMany({ chargebackId: cbA?._id }),
      AgentTrace.deleteMany({ entityType: 'CHARGEBACK_REBUTTAL' }),
    ]);
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  describe('1. Response Generation & Persistence', () => {
    it('POST /generate creates and persists ChargebackResponse with AgentTraces and AuditLog', async () => {
      const res = await fetch(`${baseUrl}/generate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json',
        },
      });

      const body = await res.json();
      assert.equal(res.status, 201);
      assert.equal(body.success, true);
      assert.ok(body.data._id);
      assert.equal(body.data.chargebackId, cbA._id.toString());
      assert.ok(['DEFEND', 'DEFEND_WITH_REVIEW', 'INSUFFICIENT_EVIDENCE', 'DO_NOT_RECOMMEND_DEFENSE'].includes(body.data.recommendation));
      assert.equal(body.decision.authority, 'DETERMINISTIC_POLICY');

      // Verify ChargebackResponse persisted in MongoDB
      const savedResponse = await ChargebackResponse.findById(body.data._id);
      assert.ok(savedResponse);
      assert.equal(savedResponse.merchantId.toString(), merchantA._id.toString());
      assert.ok(savedResponse.confidence >= 0 && savedResponse.confidence <= 100);

      // Verify AgentTrace records were created with entityType CHARGEBACK_REBUTTAL
      const traces = await AgentTrace.find({
        entityType: 'CHARGEBACK_REBUTTAL',
        entityId: cbA._id,
      });
      assert.ok(traces.length >= 1, 'Expected at least 1 agent trace');
      assert.ok(traces.some((t) => t.agentName === 'CHARGEBACK_RESPONSE'));

      // Verify AuditLog record was created
      const audit = await AuditLog.findOne({
        entityType: 'ChargebackResponse',
        entityId: savedResponse._id,
        action: 'GENERATE_CHARGEBACK_RESPONSE',
      });
      assert.ok(audit, 'Expected AuditLog entry for response generation');
      assert.equal(audit.actorId, merchantA._id.toString());
    });
  });

  describe('2. Tenant Isolation Enforcement', () => {
    it('Merchant B receives 404 when attempting to GET Merchant A chargeback response', async () => {
      const res = await fetch(baseUrl, {
        headers: { Authorization: `Bearer ${tokenB}` },
      });

      const body = await res.json();
      assert.equal(res.status, 404);
      assert.equal(body.success, false);
      assert.equal(body.error.code, 'RESOURCE_NOT_FOUND');
    });

    it('Merchant A can retrieve their own persisted response via GET /', async () => {
      const res = await fetch(baseUrl, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });

      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.success, true);
      assert.equal(body.data.chargebackId, cbA._id.toString());
    });
  });

  describe('3. Deterministic Verification on Live Data', () => {
    it('POST /verify rejects response containing prohibited fraud claims', async () => {
      const res = await fetch(`${baseUrl}/verify`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          responseText: 'The cardholder is lying and fabricated the dispute.',
        }),
      });

      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.data.status, 'REJECTED');
      assert.equal(body.data.recommendation, 'DO_NOT_RECOMMEND_DEFENSE');

      // Verify DB was updated
      const updated = await ChargebackResponse.findOne({ chargebackId: cbA._id });
      assert.equal(updated.status, 'REJECTED');
    });
  });
});
