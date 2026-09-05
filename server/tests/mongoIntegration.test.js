const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const mongoose = require('mongoose');
const app = require('../src/app');
const env = require('../src/config/env');
const { signAccessToken } = require('../src/utils/jwt');
const { Transaction, Merchant } = require('../src/models');
const { hashPassword } = require('../src/utils/password');

const MONGODB_URI = process.env.MONGODB_URI || env.MONGODB_URI;

const TEST_JWT_SECRET = 'test-secret-key-for-riskyplay-isolation-suite-12345';
env.JWT_SECRET = TEST_JWT_SECRET;
process.env.JWT_SECRET = TEST_JWT_SECRET;

describe('MONGODB LIVE INTEGRATION — TENANT ISOLATION', () => {
  if (!MONGODB_URI || MONGODB_URI.trim() === '') {
    it.skip('Skipping live MongoDB integration tests (MONGODB_URI is not configured)', () => {
      // Intentionally skipped when no database connection is configured
    });
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

  before(async () => {
    // Connect to live MongoDB
    await mongoose.connect(MONGODB_URI);

    // Clean up test data if any
    await Promise.all([
      Merchant.deleteMany({ email: { $in: ['integration-a@test.com', 'integration-b@test.com'] } }),
      Transaction.deleteMany({ externalTransactionId: { $in: ['INT-TX-A1', 'INT-TX-B1', 'INT-TX-A2'] } }),
    ]);

    // Create 2 real merchants
    const passwordHash = await hashPassword('IntegrationPass1!');
    merchantA = await Merchant.create({
      name: 'Integration Merchant A',
      email: 'integration-a@test.com',
      passwordHash,
      currency: 'USD',
    });

    merchantB = await Merchant.create({
      name: 'Integration Merchant B',
      email: 'integration-b@test.com',
      passwordHash,
      currency: 'EUR',
    });

    tokenA = signAccessToken(merchantA);
    tokenB = signAccessToken(merchantB);

    // Start HTTP server
    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}/api/v1/transactions`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (mongoose.connection.readyState !== 0) {
      await Promise.all([
        Merchant.deleteMany({ email: { $in: ['integration-a@test.com', 'integration-b@test.com'] } }),
        Transaction.deleteMany({ externalTransactionId: { $in: ['INT-TX-A1', 'INT-TX-B1', 'INT-TX-A2'] } }),
      ]);
      await mongoose.disconnect();
    }
  });

  it('Merchant A creates a transaction — verified in MongoDB to belong to Merchant A', async () => {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        externalTransactionId: 'INT-TX-A1',
        amount: 199.99,
        currency: 'USD',
        merchantId: merchantB._id.toString(), // Untrusted input: attempts to assign to B
      }),
    });

    const data = await res.json();
    assert.equal(res.status, 201);
    assert.equal(data.success, true);
    txAId = data.data._id;

    // Verify in MongoDB directly
    const stored = await Transaction.findById(txAId);
    assert.ok(stored);
    assert.equal(stored.merchantId.toString(), merchantA._id.toString());
    assert.notEqual(stored.merchantId.toString(), merchantB._id.toString());
  });

  it('Merchant B creates a transaction — verified in MongoDB to belong to Merchant B', async () => {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenB}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        externalTransactionId: 'INT-TX-B1',
        amount: 89.50,
        currency: 'EUR',
      }),
    });

    const data = await res.json();
    assert.equal(res.status, 201);
    assert.equal(data.success, true);
    txBId = data.data._id;

    const stored = await Transaction.findById(txBId);
    assert.ok(stored);
    assert.equal(stored.merchantId.toString(), merchantB._id.toString());
  });

  it('Merchant A lists transactions — returns only Merchant A records from MongoDB', async () => {
    const res = await fetch(baseUrl, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const data = await res.json();

    assert.equal(res.status, 200);
    assert.equal(data.success, true);
    assert.ok(data.data.length >= 1);
    for (const tx of data.data) {
      assert.equal(tx.merchantId.toString(), merchantA._id.toString());
    }
  });

  it('Merchant B lists transactions — returns only Merchant B records from MongoDB', async () => {
    const res = await fetch(baseUrl, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    const data = await res.json();

    assert.equal(res.status, 200);
    assert.equal(data.success, true);
    assert.ok(data.data.length >= 1);
    for (const tx of data.data) {
      assert.equal(tx.merchantId.toString(), merchantB._id.toString());
    }
  });

  it('Merchant A can retrieve Merchant A transaction by ID from MongoDB', async () => {
    const res = await fetch(`${baseUrl}/${txAId}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const data = await res.json();

    assert.equal(res.status, 200);
    assert.equal(data.success, true);
    assert.equal(data.data._id.toString(), txAId);
    assert.equal(data.data.merchantId.toString(), merchantA._id.toString());
  });

  it('Merchant B receives 404 TRANSACTION_NOT_FOUND when attempting to read Merchant A transaction', async () => {
    const res = await fetch(`${baseUrl}/${txAId}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    const data = await res.json();

    assert.equal(res.status, 404);
    assert.equal(data.success, false);
    assert.equal(data.error.code, 'TRANSACTION_NOT_FOUND');
  });

  it('Merchant B receives 404 when attempting to update Merchant A transaction and MongoDB remains unchanged', async () => {
    const res = await fetch(`${baseUrl}/${txAId}/status`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${tokenB}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'DECLINED' }),
    });
    const data = await res.json();

    assert.equal(res.status, 404);
    assert.equal(data.success, false);
    assert.equal(data.error.code, 'TRANSACTION_NOT_FOUND');

    // Confirm in MongoDB that Merchant A's transaction was not updated
    const unchanged = await Transaction.findById(txAId);
    assert.notEqual(unchanged.status, 'DECLINED');
  });

  it('Merchant A successfully updates Merchant A transaction in MongoDB', async () => {
    const res = await fetch(`${baseUrl}/${txAId}/status`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'APPROVED' }),
    });
    const data = await res.json();

    assert.equal(res.status, 200);
    assert.equal(data.success, true);
    assert.equal(data.data.status, 'APPROVED');

    // Confirm in MongoDB
    const updated = await Transaction.findById(txAId);
    assert.equal(updated.status, 'APPROVED');
  });
});
