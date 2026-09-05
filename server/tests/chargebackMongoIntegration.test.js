const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const mongoose = require('mongoose');
const app = require('../src/app');
const env = require('../src/config/env');
const { signAccessToken } = require('../src/utils/jwt');
const { Transaction, Merchant, Chargeback, AuditLog } = require('../src/models');
const { hashPassword } = require('../src/utils/password');

const MONGODB_URI = process.env.MONGODB_URI || env.MONGODB_URI;

const TEST_JWT_SECRET = 'test-secret-key-for-riskyplay-cb-mongo-suite-12345';
env.JWT_SECRET = TEST_JWT_SECRET;
process.env.JWT_SECRET = TEST_JWT_SECRET;

describe('MONGODB LIVE INTEGRATION — CHARGEBACK MANAGEMENT', () => {
  if (!MONGODB_URI || MONGODB_URI.trim() === '') {
    it.skip('Skipping live MongoDB chargeback integration tests (MONGODB_URI is not configured)', () => {});
    return;
  }

  let server;
  let baseUrl;
  let merchantA;
  let merchantB;
  let tokenA;
  let tokenB;
  let txAId;
  let txBId;
  let cbAId;

  before(async () => {
    // Connect to live MongoDB
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGODB_URI);
    }

    // Clean up test data if existing
    await Promise.all([
      Merchant.deleteMany({ email: { $in: ['cb-test-a@example.com', 'cb-test-b@example.com'] } }),
      Transaction.deleteMany({ externalTransactionId: { $in: ['CB-LIVE-TX-A', 'CB-LIVE-TX-B'] } }),
      Chargeback.deleteMany({ caseNumber: { $in: ['LIVE-CASE-001', 'LIVE-CASE-002', 'SHARED-CASE-999'] } }),
    ]);

    // Create 2 real merchants
    const passwordHash = await hashPassword('ChargebackPass123!');
    merchantA = await Merchant.create({
      name: 'Chargeback Merchant A',
      email: 'cb-test-a@example.com',
      passwordHash,
      currency: 'USD',
    });

    merchantB = await Merchant.create({
      name: 'Chargeback Merchant B',
      email: 'cb-test-b@example.com',
      passwordHash,
      currency: 'USD',
    });

    tokenA = signAccessToken(merchantA);
    tokenB = signAccessToken(merchantB);

    // Create real transactions
    const txA = await Transaction.create({
      merchantId: merchantA._id,
      externalTransactionId: 'CB-LIVE-TX-A',
      amount: 250.0,
      currency: 'USD',
      customer: { email: 'buyerA@example.com' },
    });
    txAId = txA._id.toString();

    const txB = await Transaction.create({
      merchantId: merchantB._id,
      externalTransactionId: 'CB-LIVE-TX-B',
      amount: 100.0,
      currency: 'USD',
      customer: { email: 'buyerB@example.com' },
    });
    txBId = txB._id.toString();

    // Start HTTP test server
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
          Transaction.deleteMany({ externalTransactionId: { $in: ['CB-LIVE-TX-A', 'CB-LIVE-TX-B'] } }),
          Chargeback.deleteMany({ merchantId: { $in: [merchantA._id, merchantB._id] } }),
          AuditLog.deleteMany({ actorId: { $in: [merchantA._id.toString(), merchantB._id.toString()] } }),
        ]);
      }
      await mongoose.disconnect();
    }
  });

  // =========================================================================
  // 1. CREATE & VALIDATION AGAINST REAL DATABASE
  // =========================================================================
  it('POST / — creates chargeback linked to real transaction and persists to MongoDB', async () => {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        caseNumber: 'LIVE-CASE-001',
        transactionId: txAId,
        network: 'VISA',
        reasonCode: '10.4',
        reasonDescription: 'Fraudulent transaction - card absent',
        disputeAmount: 250.0,
        deadline: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days out
      }),
    });

    const body = await res.json();
    assert.equal(res.status, 201);
    assert.equal(body.success, true);
    assert.equal(body.data.caseNumber, 'LIVE-CASE-001');
    assert.equal(body.data.status, 'OPEN');
    assert.equal(body.data.deadlineStatus, 'UPCOMING');
    assert.equal(body.data.disputeAmount, 250.0);
    assert.equal(body.data.merchantId, merchantA._id.toString());
    cbAId = body.data.id;

    // Verify persisted directly in MongoDB
    const persisted = await Chargeback.findById(cbAId).lean();
    assert.ok(persisted);
    assert.equal(persisted.caseNumber, 'LIVE-CASE-001');
    assert.equal(persisted.merchantId.toString(), merchantA._id.toString());
    assert.equal(persisted.status, 'OPEN');
  });

  it('POST / — rejects cross-tenant dispute creation (Merchant B disputing Merchant A tx)', async () => {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenB}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        caseNumber: 'LIVE-CASE-CROSS',
        transactionId: txAId, // Belongs to Merchant A
        network: 'VISA',
        reasonCode: '10.4',
        disputeAmount: 250.0,
        deadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    });

    const body = await res.json();
    assert.equal(res.status, 404);
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'TRANSACTION_NOT_FOUND');

    // Confirm no chargeback was created
    const orphan = await Chargeback.findOne({ caseNumber: 'LIVE-CASE-CROSS' });
    assert.equal(orphan, null);
  });

  it('POST / — rejects dispute amount mismatch with transaction', async () => {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        caseNumber: 'LIVE-CASE-MISMATCH',
        transactionId: txAId,
        network: 'VISA',
        reasonCode: '10.4',
        disputeAmount: 50.0, // Transaction amount is 250.0
        deadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    });

    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'VALIDATION_ERROR');
  });

  // =========================================================================
  // 2. TENANT-SCOPED CASE NUMBER UNIQUENESS
  // =========================================================================
  it('POST / — rejects duplicate caseNumber for the SAME merchant (409 DUPLICATE_CHARGEBACK)', async () => {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        caseNumber: 'LIVE-CASE-001', // Already created by Merchant A
        transactionId: txAId,
        network: 'VISA',
        reasonCode: '10.4',
        disputeAmount: 250.0,
        deadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    });

    const body = await res.json();
    assert.equal(res.status, 409);
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'DUPLICATE_CHARGEBACK');
  });

  it('POST / — allows identical caseNumber for a DIFFERENT merchant (tenant-scoped uniqueness)', async () => {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenB}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        caseNumber: 'LIVE-CASE-001', // Exact same caseNumber as Merchant A, but for Merchant B!
        transactionId: txBId,
        network: 'MASTERCARD',
        reasonCode: '4837',
        disputeAmount: 100.0,
        deadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    });

    const body = await res.json();
    assert.equal(res.status, 201);
    assert.equal(body.success, true);
    assert.equal(body.data.caseNumber, 'LIVE-CASE-001');
    assert.equal(body.data.merchantId, merchantB._id.toString());

    // Verify both records coexist peacefully in MongoDB
    const cases = await Chargeback.find({ caseNumber: 'LIVE-CASE-001' }).lean();
    assert.equal(cases.length, 2);
  });

  // =========================================================================
  // 3. TENANT-ISOLATED LIST & DETAIL
  // =========================================================================
  it('GET / — returns only merchant-scoped chargebacks', async () => {
    const resA = await fetch(baseUrl, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const bodyA = await resA.json();
    assert.equal(resA.status, 200);
    assert.equal(bodyA.data.length, 1);
    assert.equal(bodyA.data[0].merchantId, merchantA._id.toString());

    const resB = await fetch(baseUrl, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    const bodyB = await resB.json();
    assert.equal(resB.status, 200);
    assert.equal(bodyB.data.length, 1);
    assert.equal(bodyB.data[0].merchantId, merchantB._id.toString());
  });

  it('GET /:id — returns chargeback for owner, 404 for other merchant', async () => {
    // Merchant A requests own case -> 200
    const resA = await fetch(`${baseUrl}/${cbAId}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const bodyA = await resA.json();
    assert.equal(resA.status, 200);
    assert.equal(bodyA.data.id, cbAId);

    // Merchant B requests Merchant A's case -> 404
    const resB = await fetch(`${baseUrl}/${cbAId}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    const bodyB = await resB.json();
    assert.equal(resB.status, 404);
    assert.equal(bodyB.error.code, 'CHARGEBACK_NOT_FOUND');
  });

  // =========================================================================
  // 4. LIFECYCLE STATE TRANSITIONS & AUDIT LOGGING
  // =========================================================================
  it('PATCH /:id/status — transitions OPEN -> UNDER_REVIEW and writes to AuditLog in MongoDB', async () => {
    const res = await fetch(`${baseUrl}/${cbAId}/status`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: 'UNDER_REVIEW',
        reason: 'Merchant operator started evidence review',
      }),
    });

    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.status, 'UNDER_REVIEW');

    // Query AuditLog from MongoDB
    const auditRecord = await AuditLog.findOne({
      entityType: 'CHARGEBACK',
      entityId: new mongoose.Types.ObjectId(cbAId),
      action: 'STATUS_CHANGED',
    }).lean();

    assert.ok(auditRecord);
    assert.equal(auditRecord.actorId, merchantA._id.toString());
    assert.equal(auditRecord.actorType, 'MERCHANT');
    assert.equal(auditRecord.previousState.status, 'OPEN');
    assert.equal(auditRecord.newState.status, 'UNDER_REVIEW');
    assert.equal(auditRecord.reason, 'Merchant operator started evidence review');
  });

  it('PATCH /:id/status — rejects illegal transition and preserves current state', async () => {
    // Attempt illegal transition: UNDER_REVIEW -> OPEN
    const res = await fetch(`${baseUrl}/${cbAId}/status`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: 'OPEN',
        reason: 'Illegal revert attempt',
      }),
    });

    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'INVALID_CHARGEBACK_TRANSITION');

    // Verify state in DB remains UNDER_REVIEW
    const cb = await Chargeback.findById(cbAId).lean();
    assert.equal(cb.status, 'UNDER_REVIEW');
  });

  it('PATCH /:id/status — progresses through complete lifecycle to terminal CLOSED state', async () => {
    // UNDER_REVIEW -> RESPONSE_READY
    let res = await fetch(`${baseUrl}/${cbAId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'RESPONSE_READY' }),
    });
    assert.equal(res.status, 200);

    // RESPONSE_READY -> SUBMITTED
    res = await fetch(`${baseUrl}/${cbAId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'SUBMITTED' }),
    });
    assert.equal(res.status, 200);

    // SUBMITTED -> WON
    res = await fetch(`${baseUrl}/${cbAId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'WON' }),
    });
    assert.equal(res.status, 200);

    // WON -> CLOSED
    res = await fetch(`${baseUrl}/${cbAId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'CLOSED' }),
    });
    const finalBody = await res.json();
    assert.equal(res.status, 200);
    assert.equal(finalBody.data.status, 'CLOSED');
    assert.equal(finalBody.data.deadlineStatus, 'COMPLETED');

    // Any transition from CLOSED must fail
    res = await fetch(`${baseUrl}/${cbAId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'OPEN' }),
    });
    assert.equal(res.status, 400);
  });
});
