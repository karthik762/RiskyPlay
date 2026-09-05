const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const app = require('../src/app');
const env = require('../src/config/env');
const { signAccessToken } = require('../src/utils/jwt');
const evidenceService = require('../src/services/evidenceService');
const AppError = require('../src/utils/AppError');

// Ensure JWT_SECRET is set for testing
const TEST_JWT_SECRET = 'test-secret-key-for-riskyplay-ev-api-suite-12345';
env.JWT_SECRET = TEST_JWT_SECRET;
process.env.JWT_SECRET = TEST_JWT_SECRET;

const MERCHANT_A_ID = '507f1f77bcf86cd799439011';
const MERCHANT_B_ID = '507f1f77bcf86cd799439022';
const VALID_CB_ID = '507f1f77bcf86cd799439033';
const VALID_EV_ID = '507f1f77bcf86cd799439044';
const VALID_TX_ID = '507f1f77bcf86cd799439055';

const tokenA = signAccessToken({ _id: MERCHANT_A_ID });
const tokenB = signAccessToken({ _id: MERCHANT_B_ID });

describe('PHASE 2N — EVIDENCE API & VALIDATION (HTTP TEST SUITE)', () => {
  let server;
  let baseUrl;

  before(async () => {
    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}/api/v1/chargebacks/${VALID_CB_ID}/evidence`;
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
    it('POST / returns 401 without JWT', async () => {
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'ORDER', title: 'Receipt' }),
      });
      const data = await res.json();
      assert.equal(res.status, 401);
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'AUTHENTICATION_REQUIRED');
    });

    it('GET / returns 401 without JWT', async () => {
      const res = await fetch(baseUrl);
      const data = await res.json();
      assert.equal(res.status, 401);
      assert.equal(data.error.code, 'AUTHENTICATION_REQUIRED');
    });

    it('GET /index returns 401 without JWT', async () => {
      const res = await fetch(`${baseUrl}/index`);
      const data = await res.json();
      assert.equal(res.status, 401);
      assert.equal(data.error.code, 'AUTHENTICATION_REQUIRED');
    });

    it('GET /:evidenceId returns 401 without JWT', async () => {
      const res = await fetch(`${baseUrl}/${VALID_EV_ID}`);
      const data = await res.json();
      assert.equal(res.status, 401);
      assert.equal(data.error.code, 'AUTHENTICATION_REQUIRED');
    });

    it('PATCH /:evidenceId returns 401 without JWT', async () => {
      const res = await fetch(`${baseUrl}/${VALID_EV_ID}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Updated' }),
      });
      const data = await res.json();
      assert.equal(res.status, 401);
      assert.equal(data.error.code, 'AUTHENTICATION_REQUIRED');
    });

    it('DELETE /:evidenceId returns 401 without JWT', async () => {
      const res = await fetch(`${baseUrl}/${VALID_EV_ID}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      assert.equal(res.status, 401);
      assert.equal(data.error.code, 'AUTHENTICATION_REQUIRED');
    });
  });

  // =========================================================================
  // 2. INPUT VALIDATION & SANITIZATION
  // =========================================================================
  describe('2. Input Validation', () => {
    it('POST / rejects missing title (400 VALIDATION_ERROR)', async () => {
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: 'ORDER' }),
      });
      const data = await res.json();
      assert.equal(res.status, 400);
      assert.equal(data.error.code, 'VALIDATION_ERROR');
    });

    it('POST / rejects invalid evidence type (400 VALIDATION_ERROR)', async () => {
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: 'UNSUPPORTED_TYPE', title: 'Test' }),
      });
      const data = await res.json();
      assert.equal(res.status, 400);
      assert.equal(data.error.code, 'VALIDATION_ERROR');
    });

    it('POST / rejects path traversal in filename (400 VALIDATION_ERROR)', async () => {
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'ORDER',
          title: 'Invoice',
          fileMetadata: { filename: '../../../etc/shadow' },
        }),
      });
      const data = await res.json();
      assert.equal(res.status, 400);
      assert.equal(data.error.code, 'VALIDATION_ERROR');
    });

    it('POST / rejects prohibited sensitive fields (400 VALIDATION_ERROR)', async () => {
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'ORDER',
          title: 'Invoice',
          pan: '4111111111111111', // Forbidden
        }),
      });
      const data = await res.json();
      assert.equal(res.status, 400);
      assert.equal(data.error.code, 'VALIDATION_ERROR');
    });

    it('GET /:evidenceId rejects invalid ObjectId format (400 VALIDATION_ERROR)', async () => {
      const res = await fetch(`${baseUrl}/bad-id`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      const data = await res.json();
      assert.equal(res.status, 400);
      assert.equal(data.error.code, 'VALIDATION_ERROR');
    });
  });

  // =========================================================================
  // 3. SERVICE INTEGRATION & HTTP STATUSES
  // =========================================================================
  describe('3. Service Integration', () => {
    let origCreate;
    let origList;
    let origGetById;
    let origUpdate;
    let origDelete;
    let origIndex;

    beforeEach(() => {
      origCreate = evidenceService.createEvidence;
      origList = evidenceService.listEvidenceForChargeback;
      origGetById = evidenceService.getEvidenceById;
      origUpdate = evidenceService.updateEvidence;
      origDelete = evidenceService.deleteEvidence;
      origIndex = evidenceService.buildEvidenceIndex;
    });

    afterEach(() => {
      evidenceService.createEvidence = origCreate;
      evidenceService.listEvidenceForChargeback = origList;
      evidenceService.getEvidenceById = origGetById;
      evidenceService.updateEvidence = origUpdate;
      evidenceService.deleteEvidence = origDelete;
      evidenceService.buildEvidenceIndex = origIndex;
    });

    it('POST / returns 201 Created on valid evidence submission', async () => {
      evidenceService.createEvidence = async (merchantId, cbId, data) => ({
        id: VALID_EV_ID,
        merchantId,
        chargebackId: cbId,
        type: data.type,
        title: data.title,
        source: data.source || 'MANUAL',
      });

      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'SHIPPING',
          title: 'Shipping Manifest',
          source: 'CARRIER',
        }),
      });

      const data = await res.json();
      assert.equal(res.status, 201);
      assert.equal(data.success, true);
      assert.equal(data.data.title, 'Shipping Manifest');
      assert.equal(data.data.merchantId, MERCHANT_A_ID);
    });

    it('POST / returns 404 when chargeback is not found for merchant', async () => {
      evidenceService.createEvidence = async () => {
        throw new AppError('Chargeback not found', 404, 'CHARGEBACK_NOT_FOUND');
      };

      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'ORDER',
          title: 'Orphan Evidence',
        }),
      });

      const data = await res.json();
      assert.equal(res.status, 404);
      assert.equal(data.error.code, 'CHARGEBACK_NOT_FOUND');
    });

    it('GET / returns 200 OK with paginated list', async () => {
      evidenceService.listEvidenceForChargeback = async () => ({
        items: [{ id: VALID_EV_ID, title: 'Item 1' }],
        data: [{ id: VALID_EV_ID, title: 'Item 1' }],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1, pages: 1 },
      });

      const res = await fetch(`${baseUrl}?page=1&limit=20`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });

      const data = await res.json();
      assert.equal(res.status, 200);
      assert.equal(data.success, true);
      assert.equal(data.data.length, 1);
    });

    it('GET /index returns 200 OK with deterministic index', async () => {
      evidenceService.buildEvidenceIndex = async (merchantId, cbId) => ({
        chargebackId: cbId,
        transactionId: VALID_TX_ID,
        evidenceCount: 2,
        categories: { ORDER: 1, DELIVERY: 1 },
        facts: [{ category: 'DELIVERY', fact: 'deliveryStatus', value: 'DELIVERED' }],
        coverage: { order: true, delivery: true },
        warnings: [],
      });

      const res = await fetch(`${baseUrl}/index`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });

      const data = await res.json();
      assert.equal(res.status, 200);
      assert.equal(data.success, true);
      assert.equal(data.data.evidenceCount, 2);
      assert.equal(data.data.coverage.delivery, true);
    });

    it('DELETE /:evidenceId returns 200 OK on successful deletion', async () => {
      evidenceService.deleteEvidence = async () => ({
        success: true,
        message: 'Evidence deleted successfully',
      });

      const res = await fetch(`${baseUrl}/${VALID_EV_ID}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tokenA}` },
      });

      const data = await res.json();
      assert.equal(res.status, 200);
      assert.equal(data.success, true);
    });
  });
});
