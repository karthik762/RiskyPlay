const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const mongoose = require('mongoose');
const app = require('../src/app');
const env = require('../src/config/env');
const { signAccessToken } = require('../src/utils/jwt');
const { Transaction, RiskAssessment } = require('../src/models');

const TEST_JWT_SECRET = 'test-secret-key-for-riskyplay-risk-suite-12345';
env.JWT_SECRET = TEST_JWT_SECRET;
process.env.JWT_SECRET = TEST_JWT_SECRET;

const MERCHANT_A_ID = '507f1f77bcf86cd799439011';
const MERCHANT_B_ID = '507f1f77bcf86cd799439022';

const tokenA = signAccessToken({ _id: MERCHANT_A_ID });
const tokenB = signAccessToken({ _id: MERCHANT_B_ID });

describe('RISK API & TENANT ISOLATION TESTS (MOCK / IN-MEMORY)', () => {
  let server;
  let baseUrl;

  // In-memory mock stores for transactions and risk assessments
  let mockTransactions = [];
  let mockAssessments = [];

  let originalTxFindOne;
  let originalAssessmentCreate;
  let originalAssessmentFindOne;

  before(async () => {
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
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(() => {
    // Reset mock data
    mockTransactions = [
      {
        _id: new mongoose.Types.ObjectId('64a1b2c3d4e5f6a7b8c9d001'),
        merchantId: new mongoose.Types.ObjectId(MERCHANT_A_ID),
        externalTransactionId: 'TX-A-001',
        amount: 1200.0,
        currency: 'USD',
        customer: { email: 'buyer.a@example.com' },
        cartItems: [{ title: 'Laptop', price: 600.0, quantity: 2 }],
        status: 'MANUAL_REVIEW',
        createdAt: new Date(),
      },
      {
        _id: new mongoose.Types.ObjectId('64a1b2c3d4e5f6a7b8c9d002'),
        merchantId: new mongoose.Types.ObjectId(MERCHANT_B_ID),
        externalTransactionId: 'TX-B-001',
        amount: 45.0,
        currency: 'USD',
        customer: { email: 'buyer.b@example.com' },
        cartItems: [{ title: 'Shirt', price: 45.0, quantity: 1 }],
        status: 'MANUAL_REVIEW',
        createdAt: new Date(),
      },
    ];

    mockAssessments = [];

    // Mock Transaction.findOne
    originalTxFindOne = Transaction.findOne;
    Transaction.findOne = (query) => {
      const idStr = query._id ? query._id.toString() : null;
      const merchantIdStr = query.merchantId ? query.merchantId.toString() : null;

      const found = mockTransactions.find((tx) => {
        const matchId = !idStr || tx._id.toString() === idStr;
        const matchMerchant = !merchantIdStr || tx.merchantId.toString() === merchantIdStr;
        return matchId && matchMerchant;
      });

      return {
        lean: () => Promise.resolve(found ? { ...found } : null),
        then: (resolve, reject) => Promise.resolve(found ? { ...found } : null).then(resolve, reject),
      };
    };

    // Mock RiskAssessment.create
    originalAssessmentCreate = RiskAssessment.create;
    RiskAssessment.create = async (doc) => {
      const assessment = {
        _id: new mongoose.Types.ObjectId(),
        ...doc,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockAssessments.push(assessment);
      return assessment;
    };

    // Mock RiskAssessment.findOne
    originalAssessmentFindOne = RiskAssessment.findOne;
    RiskAssessment.findOne = (query) => {
      const txIdStr = query.transactionId ? query.transactionId.toString() : null;
      const matches = mockAssessments.filter((a) => {
        return !txIdStr || a.transactionId.toString() === txIdStr;
      });

      return {
        sort: (sortObj) => {
          let sorted = [...matches];
          if (sortObj && sortObj.createdAt === -1) {
            sorted.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
          }
          const latest = sorted.length > 0 ? sorted[0] : null;
          return {
            lean: () => Promise.resolve(latest ? { ...latest } : null),
            then: (resolve, reject) => Promise.resolve(latest ? { ...latest } : null).then(resolve, reject),
          };
        },
        lean: () => Promise.resolve(matches.length > 0 ? { ...matches[0] } : null),
        then: (resolve, reject) => Promise.resolve(matches.length > 0 ? { ...matches[0] } : null).then(resolve, reject),
      };
    };
  });

  afterEach(() => {
    Transaction.findOne = originalTxFindOne;
    RiskAssessment.create = originalAssessmentCreate;
    RiskAssessment.findOne = originalAssessmentFindOne;
  });

  // =========================================================================
  // 1. AUTHENTICATION PROTECTION
  // =========================================================================
  describe('1. Authentication Protection', () => {
    it('POST /:id/risk returns 401 when requested without Authorization header', async () => {
      const res = await fetch(`${baseUrl}/64a1b2c3d4e5f6a7b8c9d001/risk`, {
        method: 'POST',
      });
      const data = await res.json();
      assert.equal(res.status, 401);
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'AUTHENTICATION_REQUIRED');
    });

    it('GET /:id/risk returns 401 when requested without Authorization header', async () => {
      const res = await fetch(`${baseUrl}/64a1b2c3d4e5f6a7b8c9d001/risk`);
      const data = await res.json();
      assert.equal(res.status, 401);
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'AUTHENTICATION_REQUIRED');
    });

    it('POST /:id/risk returns 401 with invalid JWT', async () => {
      const res = await fetch(`${baseUrl}/64a1b2c3d4e5f6a7b8c9d001/risk`, {
        method: 'POST',
        headers: { Authorization: 'Bearer invalid.token' },
      });
      const data = await res.json();
      assert.equal(res.status, 401);
      assert.equal(data.error.code, 'INVALID_TOKEN');
    });
  });

  // =========================================================================
  // 2. PARAMETER VALIDATION
  // =========================================================================
  describe('2. Parameter Validation', () => {
    it('POST /:id/risk returns 400 VALIDATION_ERROR on malformed transaction ID', async () => {
      const res = await fetch(`${baseUrl}/not-an-id/risk`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      const data = await res.json();
      assert.equal(res.status, 400);
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'VALIDATION_ERROR');
    });

    it('GET /:id/risk returns 400 VALIDATION_ERROR on malformed transaction ID', async () => {
      const res = await fetch(`${baseUrl}/12345/risk`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      const data = await res.json();
      assert.equal(res.status, 400);
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'VALIDATION_ERROR');
    });
  });

  // =========================================================================
  // 3. TENANT ISOLATION & NON-EXISTENCE
  // =========================================================================
  describe('3. Tenant Isolation & Non-Existence Handling', () => {
    it('Merchant B receives 404 TRANSACTION_NOT_FOUND when attempting to analyze Merchant A transaction', async () => {
      const txAId = '64a1b2c3d4e5f6a7b8c9d001';
      const res = await fetch(`${baseUrl}/${txAId}/risk`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenB}` },
      });
      const data = await res.json();
      assert.equal(res.status, 404);
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'TRANSACTION_NOT_FOUND');
      // Ensure no assessment was persisted
      assert.equal(mockAssessments.length, 0);
    });

    it('Merchant B receives 404 TRANSACTION_NOT_FOUND when attempting to read Merchant A risk assessment', async () => {
      const txAId = '64a1b2c3d4e5f6a7b8c9d001';
      // First Merchant A creates an assessment
      await fetch(`${baseUrl}/${txAId}/risk`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(mockAssessments.length, 1);

      // Now Merchant B tries to read it
      const res = await fetch(`${baseUrl}/${txAId}/risk`, {
        headers: { Authorization: `Bearer ${tokenB}` },
      });
      const data = await res.json();
      assert.equal(res.status, 404);
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'TRANSACTION_NOT_FOUND');
    });

    it('Non-existent transaction returns 404 TRANSACTION_NOT_FOUND without revealing database structure', async () => {
      const randomId = '507f1f77bcf86cd799439099';
      const res = await fetch(`${baseUrl}/${randomId}/risk`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      const data = await res.json();
      assert.equal(res.status, 404);
      assert.equal(data.error.code, 'TRANSACTION_NOT_FOUND');
    });
  });

  // =========================================================================
  // 4. SUCCESSFUL ASSESSMENT & PERSISTENCE
  // =========================================================================
  describe('4. Successful Risk Assessment & Duplicate Re-run Behavior', () => {
    it('Merchant A successfully assesses Merchant A transaction (HTTP 201)', async () => {
      const txAId = '64a1b2c3d4e5f6a7b8c9d001'; // Amount $1200, matching cart ($1200), email present
      const res = await fetch(`${baseUrl}/${txAId}/risk`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      const data = await res.json();

      assert.equal(res.status, 201);
      assert.equal(data.success, true);
      assert.ok(data.data._id);
      assert.equal(data.data.transactionId.toString(), txAId);
      assert.equal(data.data.merchantId.toString(), MERCHANT_A_ID);
      // High value ($1200) -> 40 points -> MEDIUM tier / REVIEW
      assert.equal(data.data.riskScore, 40);
      assert.equal(data.data.riskTier, 'MEDIUM');
      assert.equal(data.data.recommendation, 'REVIEW');
      assert.equal(data.data.baselineScore, 40);
      assert.equal(data.data.aiScore, null);
      assert.equal(data.data.signals.length, 1);
      assert.equal(data.data.signals[0].code, 'HIGH_VALUE_TRANSACTION');
      assert.equal(data.data.ruleMatches.length, 1);
      assert.equal(data.data.ruleMatches[0].rule, 'HIGH_VALUE_TRANSACTION');
      assert.equal(data.data.ruleMatches[0].points, 40);
    });

    it('GET /:id/risk returns 404 RISK_ASSESSMENT_NOT_FOUND before any analysis is run', async () => {
      const txAId = '64a1b2c3d4e5f6a7b8c9d001';
      const res = await fetch(`${baseUrl}/${txAId}/risk`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      const data = await res.json();
      assert.equal(res.status, 404);
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'RISK_ASSESSMENT_NOT_FOUND');
    });

    it('Calling POST /:id/risk multiple times preserves audit history; GET returns latest', async () => {
      const txAId = '64a1b2c3d4e5f6a7b8c9d001';

      // 1st POST
      const res1 = await fetch(`${baseUrl}/${txAId}/risk`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      const data1 = await res1.json();
      assert.equal(res1.status, 201);

      // Short delay to ensure distinct timestamp
      await new Promise((r) => setTimeout(r, 10));

      // 2nd POST
      const res2 = await fetch(`${baseUrl}/${txAId}/risk`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      const data2 = await res2.json();
      assert.equal(res2.status, 201);

      // Verify both assessments are retained in mock store
      assert.equal(mockAssessments.length, 2);
      assert.notEqual(data1.data._id.toString(), data2.data._id.toString());

      // GET returns the latest assessment
      const getRes = await fetch(`${baseUrl}/${txAId}/risk`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      const getData = await getRes.json();
      assert.equal(getRes.status, 200);
      assert.equal(getData.success, true);
      assert.equal(getData.data._id.toString(), data2.data._id.toString());
    });
  });
});
