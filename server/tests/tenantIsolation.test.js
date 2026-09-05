const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const mongoose = require('mongoose');
const app = require('../src/app');
const env = require('../src/config/env');
const { signAccessToken } = require('../src/utils/jwt');
const { Transaction } = require('../src/models');
const transactionService = require('../src/services/transactionService');
const AppError = require('../src/utils/AppError');

// Ensure JWT_SECRET is set for testing
const TEST_JWT_SECRET = 'test-secret-key-for-riskyplay-isolation-suite-12345';
env.JWT_SECRET = TEST_JWT_SECRET;
process.env.JWT_SECRET = TEST_JWT_SECRET;

const MERCHANT_A_ID = '507f1f77bcf86cd799439011';
const MERCHANT_B_ID = '507f1f77bcf86cd799439022';

const tokenA = signAccessToken({ _id: MERCHANT_A_ID });
const tokenB = signAccessToken({ _id: MERCHANT_B_ID });

describe('PHASE 2G — TRANSACTION AUTHORIZATION & TENANT ISOLATION', () => {
  let server;
  let baseUrl;

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

  // =========================================================================
  // A. AUTHENTICATION PROTECTION
  // =========================================================================
  describe('A. Authentication Protection on All Transaction Endpoints', () => {
    it('POST /api/v1/transactions should return 401 without JWT', async () => {
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ externalTransactionId: 'TX-1', amount: 100 }),
      });
      const data = await res.json();

      assert.equal(res.status, 401);
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'AUTHENTICATION_REQUIRED');
    });

    it('GET /api/v1/transactions should return 401 without JWT', async () => {
      const res = await fetch(baseUrl);
      const data = await res.json();

      assert.equal(res.status, 401);
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'AUTHENTICATION_REQUIRED');
    });

    it('GET /api/v1/transactions/:id should return 401 without JWT', async () => {
      const res = await fetch(`${baseUrl}/507f1f77bcf86cd799439033`);
      const data = await res.json();

      assert.equal(res.status, 401);
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'AUTHENTICATION_REQUIRED');
    });

    it('PATCH /api/v1/transactions/:id/status should return 401 without JWT', async () => {
      const res = await fetch(`${baseUrl}/507f1f77bcf86cd799439033/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'APPROVED' }),
      });
      const data = await res.json();

      assert.equal(res.status, 401);
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'AUTHENTICATION_REQUIRED');
    });

    it('Should return 401 when token is invalid or malformed', async () => {
      const endpoints = [
        { method: 'GET', url: baseUrl },
        { method: 'POST', url: baseUrl, body: JSON.stringify({ externalTransactionId: 'T', amount: 10 }) },
        { method: 'GET', url: `${baseUrl}/507f1f77bcf86cd799439033` },
        { method: 'PATCH', url: `${baseUrl}/507f1f77bcf86cd799439033/status`, body: JSON.stringify({ status: 'APPROVED' }) },
      ];

      for (const ep of endpoints) {
        const res = await fetch(ep.url, {
          method: ep.method,
          headers: {
            Authorization: 'Bearer invalid.token.value',
            'Content-Type': 'application/json',
          },
          body: ep.body,
        });
        const data = await res.json();
        assert.equal(res.status, 401);
        assert.equal(data.success, false);
        assert.equal(data.error.code, 'INVALID_TOKEN');
      }
    });

    it('Should return 401 when Authorization header format is malformed', async () => {
      const res = await fetch(baseUrl, {
        headers: { Authorization: 'Basic dXNlcjpwYXNz' },
      });
      const data = await res.json();

      assert.equal(res.status, 401);
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'INVALID_TOKEN');
    });
  });

  // =========================================================================
  // B. CREATE TRANSACTION OWNERSHIP
  // =========================================================================
  describe('B. Create Ownership Enforcement', () => {
    let originalCreate;
    let capturedDoc;

    beforeEach(() => {
      originalCreate = Transaction.create;
      Transaction.create = async (doc) => {
        capturedDoc = doc;
        return {
          _id: new mongoose.Types.ObjectId('64a1b2c3d4e5f6a7b8c9d0e1'),
          ...doc,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      };
    });

    afterEach(() => {
      Transaction.create = originalCreate;
      capturedDoc = null;
    });

    it('Service should force merchantId from authenticated identity and ignore client merchantId', async () => {
      const clientPayload = {
        merchantId: MERCHANT_B_ID,
        externalTransactionId: 'TX-ATTACK-01',
        amount: 250,
        currency: 'USD',
      };

      const result = await transactionService.createTransaction(MERCHANT_A_ID, clientPayload);

      assert.equal(capturedDoc.merchantId, MERCHANT_A_ID);
      assert.notEqual(capturedDoc.merchantId, MERCHANT_B_ID);
      assert.equal(result.merchantId, MERCHANT_A_ID);
    });

    it('HTTP POST /api/v1/transactions with Merchant A JWT creates transaction for Merchant A even if body specifies Merchant B', async () => {
      const clientBody = {
        merchantId: MERCHANT_B_ID,
        externalTransactionId: 'TX-HTTP-01',
        amount: 150.75,
        currency: 'USD',
      };

      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(clientBody),
      });

      const data = await res.json();
      assert.equal(res.status, 201);
      assert.equal(data.success, true);
      assert.equal(capturedDoc.merchantId, MERCHANT_A_ID);
      assert.equal(data.data.merchantId, MERCHANT_A_ID);
    });
  });

  // =========================================================================
  // C. LIST ISOLATION
  // =========================================================================
  describe('C. List Transactions Tenant Isolation', () => {
    let originalFind;
    let originalCount;
    let capturedQuery;

    beforeEach(() => {
      originalFind = Transaction.find;
      originalCount = Transaction.countDocuments;

      Transaction.find = (query) => {
        capturedQuery = query;
        return {
          sort: () => ({
            skip: () => ({
              limit: () => ({
                lean: async () => [
                  { _id: 'tx1', merchantId: query.merchantId, externalTransactionId: 'TX-1', amount: 50 },
                ],
              }),
            }),
          }),
        };
      };

      Transaction.countDocuments = async (query) => {
        return query.merchantId === MERCHANT_A_ID ? 1 : 0;
      };
    });

    afterEach(() => {
      Transaction.find = originalFind;
      Transaction.countDocuments = originalCount;
      capturedQuery = null;
    });

    it('Service list query MUST constrain by authenticated merchantId', async () => {
      await transactionService.getTransactions(MERCHANT_A_ID, { status: 'APPROVED' });

      assert.equal(capturedQuery.merchantId, MERCHANT_A_ID);
      assert.equal(capturedQuery.status, 'APPROVED');
    });

    it('HTTP GET /api/v1/transactions with Merchant A JWT queries ONLY Merchant A transactions', async () => {
      const res = await fetch(`${baseUrl}?status=APPROVED`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      const data = await res.json();

      assert.equal(res.status, 200);
      assert.equal(data.success, true);
      assert.equal(capturedQuery.merchantId, MERCHANT_A_ID);
      assert.equal(data.data[0].merchantId, MERCHANT_A_ID);
    });

    it('HTTP GET /api/v1/transactions with Merchant B JWT queries ONLY Merchant B transactions', async () => {
      const res = await fetch(baseUrl, {
        headers: { Authorization: `Bearer ${tokenB}` },
      });
      const data = await res.json();

      assert.equal(res.status, 200);
      assert.equal(data.success, true);
      assert.equal(capturedQuery.merchantId, MERCHANT_B_ID);
    });

    it('Query parameter merchantId should be rejected by strict query schema', async () => {
      const res = await fetch(`${baseUrl}?merchantId=${MERCHANT_B_ID}`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      const data = await res.json();

      assert.equal(res.status, 400);
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'VALIDATION_ERROR');
    });
  });

  // =========================================================================
  // D. SINGLE TRANSACTION ISOLATION
  // =========================================================================
  describe('D. Single Transaction Lookup Isolation', () => {
    let originalFindOne;
    const sampleTxId = '507f1f77bcf86cd799439099';

    // Mock in-memory database of transactions
    const transactionsInDb = [
      {
        _id: sampleTxId,
        merchantId: MERCHANT_A_ID,
        externalTransactionId: 'TX-MERCHANT-A',
        amount: 200,
        status: 'APPROVED',
      },
    ];

    beforeEach(() => {
      originalFindOne = Transaction.findOne;
      Transaction.findOne = (query) => {
        const found = transactionsInDb.find(
          (t) => t._id.toString() === query._id.toString() && t.merchantId.toString() === query.merchantId.toString()
        );
        return Promise.resolve(found || null);
      };
    });

    afterEach(() => {
      Transaction.findOne = originalFindOne;
    });

    it('Merchant A can retrieve Merchant A transaction', async () => {
      const res = await fetch(`${baseUrl}/${sampleTxId}`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      const data = await res.json();

      assert.equal(res.status, 200);
      assert.equal(data.success, true);
      assert.equal(data.data._id, sampleTxId);
      assert.equal(data.data.merchantId, MERCHANT_A_ID);
    });

    it('Merchant B cannot retrieve Merchant A transaction and receives 404 TRANSACTION_NOT_FOUND', async () => {
      const res = await fetch(`${baseUrl}/${sampleTxId}`, {
        headers: { Authorization: `Bearer ${tokenB}` },
      });
      const data = await res.json();

      assert.equal(res.status, 404);
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'TRANSACTION_NOT_FOUND');
      assert.equal(data.error.message, 'Transaction not found');
    });

    it('Non-existent transaction returns exact same 404 error (no leak of existence)', async () => {
      const nonExistentId = '507f1f77bcf86cd799439088';
      const res = await fetch(`${baseUrl}/${nonExistentId}`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      const data = await res.json();

      assert.equal(res.status, 404);
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'TRANSACTION_NOT_FOUND');
    });
  });

  // =========================================================================
  // E. UPDATE TRANSACTION STATUS ISOLATION
  // =========================================================================
  describe('E. Update Transaction Status Isolation', () => {
    let originalFindOneAndUpdate;
    const sampleTxId = '507f1f77bcf86cd799439099';

    // Mock in-memory database of transactions
    const transactionsInDb = [
      {
        _id: sampleTxId,
        merchantId: MERCHANT_A_ID,
        status: 'MANUAL_REVIEW',
      },
    ];

    beforeEach(() => {
      originalFindOneAndUpdate = Transaction.findOneAndUpdate;
      Transaction.findOneAndUpdate = (query, update) => {
        const item = transactionsInDb.find(
          (t) => t._id.toString() === query._id.toString() && t.merchantId.toString() === query.merchantId.toString()
        );
        if (!item) return Promise.resolve(null);
        item.status = update.status;
        return Promise.resolve({ ...item });
      };
    });

    afterEach(() => {
      Transaction.findOneAndUpdate = originalFindOneAndUpdate;
      transactionsInDb[0].status = 'MANUAL_REVIEW';
    });

    it('Merchant A can update Merchant A transaction status', async () => {
      const res = await fetch(`${baseUrl}/${sampleTxId}/status`, {
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
      assert.equal(transactionsInDb[0].status, 'APPROVED');
    });

    it('Merchant B cannot update Merchant A transaction and receives 404 TRANSACTION_NOT_FOUND', async () => {
      const res = await fetch(`${baseUrl}/${sampleTxId}/status`, {
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
      // Verify Merchant A's transaction remained completely unchanged
      assert.equal(transactionsInDb[0].status, 'MANUAL_REVIEW');
    });
  });

  // =========================================================================
  // F. EXISTING BEHAVIOR PRESERVATION
  // =========================================================================
  describe('F. Preservation of Existing Behaviors', () => {
    it('Health endpoint /api/v1/health should return 200 OK without auth', async () => {
      const healthUrl = baseUrl.replace('/transactions', '/health');
      const res = await fetch(healthUrl);
      const data = await res.json();

      assert.equal(res.status, 200);
      assert.equal(data.status, 'ok');
      assert.equal(data.service, 'RiskyPlay API');
    });

    it('Request validation rejects invalid payload with 400 VALIDATION_ERROR', async () => {
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: -50,
        }),
      });
      const data = await res.json();

      assert.equal(res.status, 400);
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'VALIDATION_ERROR');
    });

    it('Request validation rejects prohibited payment fields (e.g. cvv, pan)', async () => {
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          externalTransactionId: 'TX-CARD-01',
          amount: 100,
          paymentMethod: {
            cardBin: '411111',
            cvv: '123',
          },
        }),
      });
      const data = await res.json();

      assert.equal(res.status, 400);
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'VALIDATION_ERROR');
    });

    it('Invalid status in PATCH /status rejects with 400 VALIDATION_ERROR', async () => {
      const res = await fetch(`${baseUrl}/507f1f77bcf86cd799439033/status`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'INVALID_STATUS' }),
      });
      const data = await res.json();

      assert.equal(res.status, 400);
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'VALIDATION_ERROR');
    });

    it('Unmatched routes return 404 NOT_FOUND', async () => {
      const notFoundUrl = baseUrl.replace('/transactions', '/non-existent-route');
      const res = await fetch(notFoundUrl);
      const data = await res.json();

      assert.equal(res.status, 404);
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'NOT_FOUND');
    });
  });
});
