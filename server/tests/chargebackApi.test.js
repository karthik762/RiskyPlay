const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const mongoose = require('mongoose');
const app = require('../src/app');
const env = require('../src/config/env');
const { signAccessToken } = require('../src/utils/jwt');
const chargebackService = require('../src/services/chargebackService');
const AppError = require('../src/utils/AppError');

// Ensure JWT_SECRET is set for testing
const TEST_JWT_SECRET = 'test-secret-key-for-riskyplay-cb-api-suite-12345';
env.JWT_SECRET = TEST_JWT_SECRET;
process.env.JWT_SECRET = TEST_JWT_SECRET;

const MERCHANT_A_ID = '507f1f77bcf86cd799439011';
const MERCHANT_B_ID = '507f1f77bcf86cd799439022';
const VALID_TX_ID = '507f1f77bcf86cd799439033';
const VALID_CB_ID = '507f1f77bcf86cd799439044';

const tokenA = signAccessToken({ _id: MERCHANT_A_ID });
const tokenB = signAccessToken({ _id: MERCHANT_B_ID });

describe('PHASE 2M — CHARGEBACK API & VALIDATION (HTTP TEST SUITE)', () => {
  let server;
  let baseUrl;

  before(async () => {
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
    await new Promise((resolve) => server.close(resolve));
  });

  // =========================================================================
  // 1. AUTHENTICATION PROTECTION
  // =========================================================================
  describe('1. Authentication Protection', () => {
    it('POST /api/v1/chargebacks returns 401 without JWT', async () => {
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseNumber: 'CB-1',
          transactionId: VALID_TX_ID,
          network: 'VISA',
          reasonCode: '10.4',
          disputeAmount: 100,
          deadline: '2026-09-20',
        }),
      });
      const data = await res.json();
      assert.equal(res.status, 401);
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'AUTHENTICATION_REQUIRED');
    });

    it('GET /api/v1/chargebacks returns 401 without JWT', async () => {
      const res = await fetch(baseUrl);
      const data = await res.json();
      assert.equal(res.status, 401);
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'AUTHENTICATION_REQUIRED');
    });

    it('GET /api/v1/chargebacks/:id returns 401 without JWT', async () => {
      const res = await fetch(`${baseUrl}/${VALID_CB_ID}`);
      const data = await res.json();
      assert.equal(res.status, 401);
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'AUTHENTICATION_REQUIRED');
    });

    it('PATCH /api/v1/chargebacks/:id/status returns 401 without JWT', async () => {
      const res = await fetch(`${baseUrl}/${VALID_CB_ID}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'UNDER_REVIEW' }),
      });
      const data = await res.json();
      assert.equal(res.status, 401);
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'AUTHENTICATION_REQUIRED');
    });

    it('returns 401 with invalid JWT format', async () => {
      const res = await fetch(baseUrl, {
        headers: { Authorization: 'Bearer invalid.token.payload' },
      });
      const data = await res.json();
      assert.equal(res.status, 401);
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'INVALID_TOKEN');
    });
  });

  // =========================================================================
  // 2. INPUT VALIDATION & REQUEST SANITIZATION
  // =========================================================================
  describe('2. Input Validation', () => {
    it('POST / rejects missing required fields (400 VALIDATION_ERROR)', async () => {
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      assert.equal(res.status, 400);
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'VALIDATION_ERROR');
    });

    it('POST / rejects invalid ObjectId in transactionId (400 VALIDATION_ERROR)', async () => {
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          caseNumber: 'CB-1',
          transactionId: 'invalid-id-123',
          network: 'VISA',
          reasonCode: '10.4',
          disputeAmount: 100,
          deadline: '2026-09-20',
        }),
      });
      const data = await res.json();
      assert.equal(res.status, 400);
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'VALIDATION_ERROR');
    });

    it('POST / rejects unsupported card network (400 VALIDATION_ERROR)', async () => {
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          caseNumber: 'CB-1',
          transactionId: VALID_TX_ID,
          network: 'DISCOVER_UNSUPPORTED',
          reasonCode: '10.4',
          disputeAmount: 100,
          deadline: '2026-09-20',
        }),
      });
      const data = await res.json();
      assert.equal(res.status, 400);
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'VALIDATION_ERROR');
    });

    it('POST / rejects negative disputeAmount (400 VALIDATION_ERROR)', async () => {
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          caseNumber: 'CB-1',
          transactionId: VALID_TX_ID,
          network: 'VISA',
          reasonCode: '10.4',
          disputeAmount: -50,
          deadline: '2026-09-20',
        }),
      });
      const data = await res.json();
      assert.equal(res.status, 400);
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'VALIDATION_ERROR');
    });

    it('POST / rejects invalid deadline date string (400 VALIDATION_ERROR)', async () => {
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          caseNumber: 'CB-1',
          transactionId: VALID_TX_ID,
          network: 'VISA',
          reasonCode: '10.4',
          disputeAmount: 100,
          deadline: 'not-a-valid-date',
        }),
      });
      const data = await res.json();
      assert.equal(res.status, 400);
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'VALIDATION_ERROR');
    });

    it('POST / rejects unrecognized/prohibited fields in request body (400)', async () => {
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          caseNumber: 'CB-1',
          transactionId: VALID_TX_ID,
          network: 'VISA',
          reasonCode: '10.4',
          disputeAmount: 100,
          deadline: '2026-09-20',
          pan: '4111111111111111', // Prohibited sensitive field
        }),
      });
      const data = await res.json();
      assert.equal(res.status, 400);
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'VALIDATION_ERROR');
    });

    it('GET /:id rejects invalid ObjectId in param (400 VALIDATION_ERROR)', async () => {
      const res = await fetch(`${baseUrl}/bad-object-id`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      const data = await res.json();
      assert.equal(res.status, 400);
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'VALIDATION_ERROR');
    });

    it('GET / rejects unrecognized query parameters (400 VALIDATION_ERROR)', async () => {
      const res = await fetch(`${baseUrl}?maliciousParam=1&$where=hack`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      const data = await res.json();
      assert.equal(res.status, 400);
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'VALIDATION_ERROR');
    });

    it('PATCH /:id/status rejects invalid target status (400 VALIDATION_ERROR)', async () => {
      const res = await fetch(`${baseUrl}/${VALID_CB_ID}/status`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'INVALID_STATUS_VALUE' }),
      });
      const data = await res.json();
      assert.equal(res.status, 400);
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'VALIDATION_ERROR');
    });
  });

  // =========================================================================
  // 3. SERVICE INTEGRATION & RESPONSE CODES
  // =========================================================================
  describe('3. Service Integration and HTTP Response Statuses', () => {
    let origCreateCb;
    let origGetCbs;
    let origGetCbById;
    let origUpdateCbStatus;

    beforeEach(() => {
      origCreateCb = chargebackService.createChargeback;
      origGetCbs = chargebackService.getChargebacks;
      origGetCbById = chargebackService.getChargebackById;
      origUpdateCbStatus = chargebackService.updateChargebackStatus;
    });

    afterEach(() => {
      chargebackService.createChargeback = origCreateCb;
      chargebackService.getChargebacks = origGetCbs;
      chargebackService.getChargebackById = origGetCbById;
      chargebackService.updateChargebackStatus = origUpdateCbStatus;
    });

    it('POST / returns 201 Created on successful chargeback creation', async () => {
      chargebackService.createChargeback = async (merchantId, data) => ({
        id: VALID_CB_ID,
        merchantId,
        transactionId: VALID_TX_ID,
        caseNumber: data.caseNumber,
        network: data.network,
        reasonCode: data.reasonCode,
        disputeAmount: data.disputeAmount,
        status: 'OPEN',
        deadlineStatus: 'UPCOMING',
      });

      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          caseNumber: 'CASE-API-1',
          transactionId: VALID_TX_ID,
          network: 'VISA',
          reasonCode: '10.4',
          disputeAmount: 120.5,
          deadline: '2026-09-25T00:00:00.000Z',
        }),
      });

      const data = await res.json();
      assert.equal(res.status, 201);
      assert.equal(data.success, true);
      assert.equal(data.data.caseNumber, 'CASE-API-1');
      assert.equal(data.data.merchantId, MERCHANT_A_ID);
    });

    it('POST / returns 404 when transaction is not found for merchant', async () => {
      chargebackService.createChargeback = async () => {
        throw new AppError('Transaction not found', 404, 'TRANSACTION_NOT_FOUND');
      };

      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          caseNumber: 'CASE-API-2',
          transactionId: VALID_TX_ID,
          network: 'VISA',
          reasonCode: '10.4',
          disputeAmount: 100,
          deadline: '2026-09-25T00:00:00.000Z',
        }),
      });

      const data = await res.json();
      assert.equal(res.status, 404);
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'TRANSACTION_NOT_FOUND');
    });

    it('POST / returns 409 when caseNumber already exists for merchant', async () => {
      chargebackService.createChargeback = async () => {
        throw new AppError('Chargeback with this caseNumber already exists', 409, 'DUPLICATE_CHARGEBACK');
      };

      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          caseNumber: 'CASE-DUPE',
          transactionId: VALID_TX_ID,
          network: 'VISA',
          reasonCode: '10.4',
          disputeAmount: 100,
          deadline: '2026-09-25T00:00:00.000Z',
        }),
      });

      const data = await res.json();
      assert.equal(res.status, 409);
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'DUPLICATE_CHARGEBACK');
    });

    it('GET / returns 200 OK with paginated list', async () => {
      chargebackService.getChargebacks = async (merchantId, filters, pagination) => ({
        items: [{ id: VALID_CB_ID, caseNumber: 'CB-1', merchantId }],
        data: [{ id: VALID_CB_ID, caseNumber: 'CB-1', merchantId }],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1, pages: 1 },
      });

      const res = await fetch(`${baseUrl}?page=1&limit=20&status=OPEN`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });

      const data = await res.json();
      assert.equal(res.status, 200);
      assert.equal(data.success, true);
      assert.equal(data.data.length, 1);
      assert.equal(data.pagination.total, 1);
    });

    it('GET /:id returns 200 OK for merchant owner', async () => {
      chargebackService.getChargebackById = async (merchantId, id) => ({
        id,
        merchantId,
        caseNumber: 'CB-SINGLE',
        status: 'OPEN',
      });

      const res = await fetch(`${baseUrl}/${VALID_CB_ID}`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });

      const data = await res.json();
      assert.equal(res.status, 200);
      assert.equal(data.success, true);
      assert.equal(data.data.id, VALID_CB_ID);
    });

    it('GET /:id returns 404 CHARGEBACK_NOT_FOUND when case does not belong to merchant', async () => {
      chargebackService.getChargebackById = async () => {
        throw new AppError('Chargeback not found', 404, 'CHARGEBACK_NOT_FOUND');
      };

      const res = await fetch(`${baseUrl}/${VALID_CB_ID}`, {
        headers: { Authorization: `Bearer ${tokenB}` },
      });

      const data = await res.json();
      assert.equal(res.status, 404);
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'CHARGEBACK_NOT_FOUND');
    });

    it('PATCH /:id/status returns 200 OK on valid transition', async () => {
      chargebackService.updateChargebackStatus = async (merchantId, id, status) => ({
        id,
        merchantId,
        status,
      });

      const res = await fetch(`${baseUrl}/${VALID_CB_ID}/status`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'UNDER_REVIEW',
          reason: 'Manual review started',
        }),
      });

      const data = await res.json();
      assert.equal(res.status, 200);
      assert.equal(data.success, true);
      assert.equal(data.data.status, 'UNDER_REVIEW');
    });

    it('PATCH /:id/status returns 400 INVALID_CHARGEBACK_TRANSITION on illegal transition', async () => {
      chargebackService.updateChargebackStatus = async () => {
        throw new AppError(
          'Cannot transition chargeback from WON to OPEN',
          400,
          'INVALID_CHARGEBACK_TRANSITION'
        );
      };

      const res = await fetch(`${baseUrl}/${VALID_CB_ID}/status`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'OPEN' }),
      });

      const data = await res.json();
      assert.equal(res.status, 400);
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'INVALID_CHARGEBACK_TRANSITION');
    });
  });
});
