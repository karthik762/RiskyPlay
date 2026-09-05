const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const mongoose = require('mongoose');
const app = require('../src/app');
const env = require('../src/config/env');
const { signAccessToken } = require('../src/utils/jwt');
const { Transaction, Merchant, Chargeback, Evidence, AuditLog } = require('../src/models');
const { hashPassword } = require('../src/utils/password');

const MONGODB_URI = process.env.MONGODB_URI || env.MONGODB_URI;

const TEST_JWT_SECRET = 'test-secret-key-for-riskyplay-ev-mongo-suite-12345';
env.JWT_SECRET = TEST_JWT_SECRET;
process.env.JWT_SECRET = TEST_JWT_SECRET;

describe('MONGODB LIVE INTEGRATION — EVIDENCE VAULT & INTELLIGENCE', () => {
  if (!MONGODB_URI || MONGODB_URI.trim() === '') {
    it.skip('Skipping live MongoDB evidence integration tests (MONGODB_URI is not configured)', () => {});
    return;
  }

  let server;
  let baseUrl;
  let merchantA;
  let merchantB;
  let tokenA;
  let tokenB;
  let txA;
  let txB;
  let cbA;
  let cbB;
  let evAId;

  before(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGODB_URI);
    }

    // Clean up test data if any
    await Promise.all([
      Merchant.deleteMany({ email: { $in: ['ev-test-a@example.com', 'ev-test-b@example.com'] } }),
      Transaction.deleteMany({ externalTransactionId: { $in: ['EV-LIVE-TX-A', 'EV-LIVE-TX-B'] } }),
      Chargeback.deleteMany({ caseNumber: { $in: ['EV-LIVE-CASE-A', 'EV-LIVE-CASE-B'] } }),
    ]);

    // Create 2 real merchants
    const passwordHash = await hashPassword('EvidencePass123!');
    merchantA = await Merchant.create({
      name: 'Evidence Merchant A',
      email: 'ev-test-a@example.com',
      passwordHash,
      currency: 'USD',
    });

    merchantB = await Merchant.create({
      name: 'Evidence Merchant B',
      email: 'ev-test-b@example.com',
      passwordHash,
      currency: 'USD',
    });

    tokenA = signAccessToken(merchantA);
    tokenB = signAccessToken(merchantB);

    // Create real transactions
    txA = await Transaction.create({
      merchantId: merchantA._id,
      externalTransactionId: 'EV-LIVE-TX-A',
      amount: 199.99,
      currency: 'USD',
      customer: { email: 'clientA@example.com' },
    });

    txB = await Transaction.create({
      merchantId: merchantB._id,
      externalTransactionId: 'EV-LIVE-TX-B',
      amount: 50.0,
      currency: 'USD',
      customer: { email: 'clientB@example.com' },
    });

    // Create real chargebacks
    cbA = await Chargeback.create({
      merchantId: merchantA._id,
      transactionId: txA._id,
      caseNumber: 'EV-LIVE-CASE-A',
      network: 'VISA',
      reasonCode: '10.4',
      disputeAmount: 199.99,
      deadlineDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      status: 'OPEN',
    });

    cbB = await Chargeback.create({
      merchantId: merchantB._id,
      transactionId: txB._id,
      caseNumber: 'EV-LIVE-CASE-B',
      network: 'MASTERCARD',
      reasonCode: '4837',
      disputeAmount: 50.0,
      deadlineDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      status: 'OPEN',
    });

    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}/api/v1/chargebacks`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (mongoose.connection.readyState !== 0) {
      if (merchantA && merchantB) {
        await Promise.all([
          Merchant.deleteMany({ _id: { $in: [merchantA._id, merchantB._id] } }),
          Transaction.deleteMany({ _id: { $in: [txA._id, txB._id] } }),
          Chargeback.deleteMany({ _id: { $in: [cbA._id, cbB._id] } }),
          Evidence.deleteMany({ merchantId: { $in: [merchantA._id, merchantB._id] } }),
          AuditLog.deleteMany({ actorId: { $in: [merchantA._id.toString(), merchantB._id.toString()] } }),
        ]);
      }
      await mongoose.disconnect();
    }
  });

  // =========================================================================
  // 1. EVIDENCE PERSISTENCE & DATABASE INVARIANTS
  // =========================================================================
  it('POST /:chargebackId/evidence — persists evidence in MongoDB and increments count', async () => {
    const res = await fetch(`${baseUrl}/${cbA._id}/evidence`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'DELIVERY',
        title: 'Signed Delivery Confirmation',
        source: 'CARRIER',
        fileMetadata: {
          filename: 'ups_delivery_slip.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 15420,
          storageKey: 'vault/ups_delivery_slip.pdf',
        },
        extractedFacts: [
          { key: 'deliveryStatus', value: 'DELIVERED', confidence: 1.0, verified: true },
          { key: 'trackingNumber', value: '1Z999999999', confidence: 1.0, verified: true },
          { key: 'deliveredAt', value: '2026-09-02T10:00:00.000Z' },
        ],
      }),
    });

    const body = await res.json();
    assert.equal(res.status, 201);
    assert.equal(body.success, true);
    assert.equal(body.data.title, 'Signed Delivery Confirmation');
    assert.equal(body.data.merchantId, merchantA._id.toString());
    assert.equal(body.data.chargebackId, cbA._id.toString());
    assert.equal(body.data.transactionId, txA._id.toString());
    evAId = body.data.id;

    // Verify persisted directly in MongoDB
    const persisted = await Evidence.findById(evAId).lean();
    assert.ok(persisted);
    assert.equal(persisted.title, 'Signed Delivery Confirmation');
    assert.equal(persisted.extractedFacts.length, 3);

    // Verify Chargeback evidence count incremented
    const updatedCb = await Chargeback.findById(cbA._id).lean();
    assert.equal(updatedCb.evidenceSummary?.evidenceCount, 1);

    // Verify AuditLog record in MongoDB
    const auditRecord = await AuditLog.findOne({
      entityType: 'EVIDENCE',
      entityId: new mongoose.Types.ObjectId(evAId),
      action: 'EVIDENCE_CREATED',
    }).lean();

    assert.ok(auditRecord);
    assert.equal(auditRecord.actorId, merchantA._id.toString());
  });

  // =========================================================================
  // 2. TENANT ISOLATION
  // =========================================================================
  it('POST /:chargebackId/evidence — rejects cross-tenant evidence attachment (Merchant B to CB A)', async () => {
    const res = await fetch(`${baseUrl}/${cbA._id}/evidence`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenB}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'ORDER',
        title: 'Intruder Evidence',
      }),
    });

    const body = await res.json();
    assert.equal(res.status, 404);
    assert.equal(body.error.code, 'CHARGEBACK_NOT_FOUND');
  });

  it('GET /:chargebackId/evidence — enforces merchant scoping', async () => {
    // Merchant A retrieves evidence list
    const resA = await fetch(`${baseUrl}/${cbA._id}/evidence`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const bodyA = await resA.json();
    assert.equal(resA.status, 200);
    assert.equal(bodyA.data.length, 1);
    assert.equal(bodyA.data[0].id, evAId);

    // Merchant B attempts to retrieve Merchant A's evidence list -> 404
    const resB = await fetch(`${baseUrl}/${cbA._id}/evidence`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    const bodyB = await resB.json();
    assert.equal(resB.status, 404);
    assert.equal(bodyB.error.code, 'CHARGEBACK_NOT_FOUND');
  });

  it('GET /:chargebackId/evidence/:evidenceId — returns 404 on cross-tenant detail request', async () => {
    const res = await fetch(`${baseUrl}/${cbA._id}/evidence/${evAId}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    const body = await res.json();
    assert.equal(res.status, 404);
  });

  // =========================================================================
  // 3. UPDATING EVIDENCE & AUDIT LOGGING
  // =========================================================================
  it('PATCH /:chargebackId/evidence/:evidenceId — updates metadata and writes to AuditLog in MongoDB', async () => {
    const res = await fetch(`${baseUrl}/${cbA._id}/evidence/${evAId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        description: 'Verified with carrier logistics dispatch',
      }),
    });

    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.data.description, 'Verified with carrier logistics dispatch');

    // Verify updated in MongoDB
    const updated = await Evidence.findById(evAId).lean();
    assert.equal(updated.description, 'Verified with carrier logistics dispatch');

    // Verify AuditLog record
    const auditRecord = await AuditLog.findOne({
      entityType: 'EVIDENCE',
      entityId: new mongoose.Types.ObjectId(evAId),
      action: 'EVIDENCE_UPDATED',
    }).lean();

    assert.ok(auditRecord);
  });

  // =========================================================================
  // 4. DETERMINISTIC EVIDENCE INDEX & PERSISTENCE
  // =========================================================================
  it('GET /:chargebackId/evidence/index — generates index, persists summary, and writes to AuditLog', async () => {
    // Add a second evidence item: ORDER
    await fetch(`${baseUrl}/${cbA._id}/evidence`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'ORDER',
        title: 'Customer Invoice Receipt',
        extractedFacts: [
          { key: 'orderAmount', value: 199.99, confidence: 1.0, verified: true },
          { key: 'orderTimestamp', value: '2026-09-01T10:00:00.000Z' },
        ],
      }),
    });

    const res = await fetch(`${baseUrl}/${cbA._id}/evidence/index`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });

    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.evidenceCount, 2);
    assert.equal(body.data.categories.DELIVERY, 1);
    assert.equal(body.data.categories.ORDER, 1);
    assert.equal(body.data.coverage.delivery, true);
    assert.equal(body.data.coverage.order, true);
    assert.equal(body.data.coverage.refund, false);
    assert.equal(body.data.warnings.length, 0);

    // Verify Chargeback evidenceSummary in MongoDB
    const cb = await Chargeback.findById(cbA._id).lean();
    assert.equal(cb.evidenceSummary.evidenceCount, 2);
    assert.equal(cb.evidenceSummary.coverage.delivery, true);
    assert.ok(cb.evidenceSummary.lastIndexedAt);

    // Verify AuditLog for index generation
    const indexAudit = await AuditLog.findOne({
      entityType: 'CHARGEBACK',
      entityId: cbA._id,
      action: 'EVIDENCE_INDEX_BUILT',
    }).lean();

    assert.ok(indexAudit);
  });

  // =========================================================================
  // 5. DELETING EVIDENCE & LIFECYCLE CONSTRAINTS
  // =========================================================================
  it('DELETE /:chargebackId/evidence/:evidenceId — deletes item and decrements count', async () => {
    const res = await fetch(`${baseUrl}/${cbA._id}/evidence/${evAId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenA}` },
    });

    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);

    // Confirm deleted from MongoDB
    const check = await Evidence.findById(evAId).lean();
    assert.equal(check, null);

    // Confirm evidenceCount decremented on Chargeback
    const cb = await Chargeback.findById(cbA._id).lean();
    assert.equal(cb.evidenceSummary.evidenceCount, 1);

    // Confirm AuditLog recorded
    const deleteAudit = await AuditLog.findOne({
      entityType: 'EVIDENCE',
      entityId: new mongoose.Types.ObjectId(evAId),
      action: 'EVIDENCE_DELETED',
    }).lean();
    assert.ok(deleteAudit);
  });

  it('DELETE /:chargebackId/evidence/:evidenceId — rejects deletion when chargeback is SUBMITTED', async () => {
    // Transition CB B to SUBMITTED
    cbB.status = 'SUBMITTED';
    await cbB.save();

    // Create an evidence item for CB B directly
    const evB = await Evidence.create({
      merchantId: merchantB._id,
      chargebackId: cbB._id,
      transactionId: txB._id,
      type: 'SHIPPING',
      title: 'Post-submission evidence',
    });

    const res = await fetch(`${baseUrl}/${cbB._id}/evidence/${evB._id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenB}` },
    });

    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.error.code, 'INVALID_EVIDENCE_OPERATION');
  });
});
