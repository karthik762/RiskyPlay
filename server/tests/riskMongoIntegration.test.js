const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const mongoose = require('mongoose');
const app = require('../src/app');
const env = require('../src/config/env');
const { signAccessToken } = require('../src/utils/jwt');
const { Transaction, Merchant, RiskAssessment } = require('../src/models');
const { hashPassword } = require('../src/utils/password');

const MONGODB_URI = process.env.MONGODB_URI || env.MONGODB_URI;

const TEST_JWT_SECRET = 'test-secret-key-for-riskyplay-mongo-risk-suite-12345';
env.JWT_SECRET = TEST_JWT_SECRET;
process.env.JWT_SECRET = TEST_JWT_SECRET;

describe('MONGODB LIVE INTEGRATION — DETERMINISTIC RISK ENGINE', () => {
  if (!MONGODB_URI || MONGODB_URI.trim() === '') {
    it.skip('Skipping live MongoDB risk integration tests (MONGODB_URI is not configured)', () => {});
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
      Merchant.deleteMany({ email: { $in: ['risk-integration-a@test.com', 'risk-integration-b@test.com'] } }),
      Transaction.deleteMany({ externalTransactionId: { $in: ['RISK-TX-A1', 'RISK-TX-B1'] } }),
    ]);

    // Create 2 real merchants
    const passwordHash = await hashPassword('RiskPass123!');
    merchantA = await Merchant.create({
      name: 'Risk Merchant A',
      email: 'risk-integration-a@test.com',
      passwordHash,
      currency: 'USD',
    });

    merchantB = await Merchant.create({
      name: 'Risk Merchant B',
      email: 'risk-integration-b@test.com',
      passwordHash,
      currency: 'USD',
    });

    tokenA = signAccessToken(merchantA);
    tokenB = signAccessToken(merchantB);

    // Create real transactions
    const txA = await Transaction.create({
      merchantId: merchantA._id,
      externalTransactionId: 'RISK-TX-A1',
      amount: 1500.0,
      currency: 'USD',
      customer: { email: 'buyer@example.com' },
      cartItems: [{ title: 'Item 1', price: 100.0, quantity: 1 }], // Cart total $100 vs $1500 tx -> Mismatch!
    });
    txAId = txA._id.toString();

    const txB = await Transaction.create({
      merchantId: merchantB._id,
      externalTransactionId: 'RISK-TX-B1',
      amount: 45.0,
      currency: 'USD',
      customer: { email: 'shopper@example.com' },
      cartItems: [{ title: 'Item 2', price: 45.0, quantity: 1 }],
    });
    txBId = txB._id.toString();

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
        Merchant.deleteMany({ email: { $in: ['risk-integration-a@test.com', 'risk-integration-b@test.com'] } }),
        Transaction.deleteMany({ externalTransactionId: { $in: ['RISK-TX-A1', 'RISK-TX-B1'] } }),
        RiskAssessment.deleteMany({ merchantId: { $in: [merchantA._id, merchantB._id] } }),
      ]);
      await mongoose.disconnect();
    }
  });

  it('Merchant A executes risk assessment — RiskAssessment document persisted in MongoDB', async () => {
    const res = await fetch(`${baseUrl}/${txAId}/risk`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenA}`,
      },
    });

    const data = await res.json();
    assert.equal(res.status, 201);
    assert.equal(data.success, true);

    // Verify in MongoDB directly
    const storedAssessment = await RiskAssessment.findById(data.data._id);
    assert.ok(storedAssessment);
    assert.equal(storedAssessment.transactionId.toString(), txAId);
    assert.equal(storedAssessment.merchantId.toString(), merchantA._id.toString());
    // $1500 (40 pts) + cart mismatch (35 pts) = 75 pts -> HIGH tier / DECLINE
    assert.equal(storedAssessment.riskScore, 75);
    assert.equal(storedAssessment.riskTier, 'HIGH');
    assert.equal(storedAssessment.recommendation, 'DECLINE');
    assert.equal(storedAssessment.baselineScore, 75);
    assert.equal(storedAssessment.aiScore, null);
    assert.equal(storedAssessment.signals.length, 2);
    assert.equal(storedAssessment.ruleMatches.length, 2);
  });

  it('Merchant A retrieves latest risk assessment via GET /:id/risk from MongoDB', async () => {
    const res = await fetch(`${baseUrl}/${txAId}/risk`, {
      headers: {
        Authorization: `Bearer ${tokenA}`,
      },
    });

    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.success, true);
    assert.equal(data.data.transactionId.toString(), txAId);
    assert.equal(data.data.riskScore, 75);
  });

  it('Merchant B receives 404 TRANSACTION_NOT_FOUND when attempting to analyze Merchant A transaction', async () => {
    const res = await fetch(`${baseUrl}/${txAId}/risk`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenB}`,
      },
    });

    const data = await res.json();
    assert.equal(res.status, 404);
    assert.equal(data.success, false);
    assert.equal(data.error.code, 'TRANSACTION_NOT_FOUND');
  });

  it('Merchant B receives 404 TRANSACTION_NOT_FOUND when attempting to retrieve Merchant A assessment', async () => {
    const res = await fetch(`${baseUrl}/${txAId}/risk`, {
      headers: {
        Authorization: `Bearer ${tokenB}`,
      },
    });

    const data = await res.json();
    assert.equal(res.status, 404);
    assert.equal(data.success, false);
    assert.equal(data.error.code, 'TRANSACTION_NOT_FOUND');
  });

  it('Re-running analysis creates a second historical assessment; GET retrieves newest record', async () => {
    // Delay 10ms to ensure distinct timestamp
    await new Promise((r) => setTimeout(r, 15));

    const res2 = await fetch(`${baseUrl}/${txAId}/risk`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenA}`,
      },
    });
    const data2 = await res2.json();
    assert.equal(res2.status, 201);

    // Verify 2 records exist in MongoDB for this transaction
    const allAssessments = await RiskAssessment.find({ transactionId: txAId }).sort({ createdAt: -1 });
    assert.equal(allAssessments.length, 2);
    assert.equal(allAssessments[0]._id.toString(), data2.data._id.toString());

    // Verify GET retrieves newest record
    const getRes = await fetch(`${baseUrl}/${txAId}/risk`, {
      headers: {
        Authorization: `Bearer ${tokenA}`,
      },
    });
    const getData = await getRes.json();
    assert.equal(getRes.status, 200);
    assert.equal(getData.data._id.toString(), data2.data._id.toString());
  });
});
