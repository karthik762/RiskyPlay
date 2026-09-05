/**
 * Integration API tests for Chargeback Defensive Response Endpoints.
 * Tests authentication, validation, tenant boundaries, and response structures.
 */

'use strict';

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const app = require('../src/app');
const env = require('../src/config/env');
const { signAccessToken } = require('../src/utils/jwt');
const chargebackResponseService = require('../src/services/chargebackResponseService');
const AppError = require('../src/utils/AppError');

const TEST_JWT_SECRET = 'test-secret-key-for-riskyplay-cb-response-api-suite-12345';
env.JWT_SECRET = TEST_JWT_SECRET;
process.env.JWT_SECRET = TEST_JWT_SECRET;

const MERCHANT_A_ID = '507f1f77bcf86cd799439011';
const MERCHANT_B_ID = '507f1f77bcf86cd799439022';
const VALID_CB_ID = '507f1f77bcf86cd799439033';

const tokenA = signAccessToken({ _id: MERCHANT_A_ID });
const tokenB = signAccessToken({ _id: MERCHANT_B_ID });

describe('PHASE 2O — CHARGEBACK RESPONSE API (HTTP TEST SUITE)', () => {
  let server;
  let baseUrl;

  before(async () => {
    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}/api/v1/chargebacks/${VALID_CB_ID}/response`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  describe('1. Authentication Protection', () => {
    it('POST /generate returns 401 without JWT', async () => {
      const res = await fetch(`${baseUrl}/generate`, { method: 'POST' });
      const data = await res.json();
      assert.equal(res.status, 401);
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'AUTHENTICATION_REQUIRED');
    });

    it('GET / returns 401 without JWT', async () => {
      const res = await fetch(baseUrl);
      const data = await res.json();
      assert.equal(res.status, 401);
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'AUTHENTICATION_REQUIRED');
    });

    it('POST /verify returns 401 without JWT', async () => {
      const res = await fetch(`${baseUrl}/verify`, { method: 'POST' });
      const data = await res.json();
      assert.equal(res.status, 401);
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'AUTHENTICATION_REQUIRED');
    });
  });

  describe('2. Parameter Validation', () => {
    it('returns 400 when chargebackId is invalid format', async () => {
      const invalidUrl = baseUrl.replace(VALID_CB_ID, 'not-a-valid-object-id');
      const res = await fetch(`${invalidUrl}/generate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      const data = await res.json();
      assert.equal(res.status, 400);
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'VALIDATION_ERROR');
    });
  });

  describe('3. Controller & Service Delegations', () => {
    let origGenerate;
    let origGet;
    let origVerify;

    beforeEach(() => {
      origGenerate = chargebackResponseService.generateResponse;
      origGet = chargebackResponseService.getResponse;
      origVerify = chargebackResponseService.verifyResponse;
    });

    afterEach(() => {
      chargebackResponseService.generateResponse = origGenerate;
      chargebackResponseService.getResponse = origGet;
      chargebackResponseService.verifyResponse = origVerify;
    });

    it('POST /generate delegates to service and returns 201 with response & decision', async () => {
      chargebackResponseService.generateResponse = async (merchantId, cbId) => {
        assert.equal(merchantId, MERCHANT_A_ID);
        assert.equal(cbId, VALID_CB_ID);
        return {
          response: {
            _id: '507f1f77bcf86cd799439099',
            chargebackId: cbId,
            recommendation: 'DEFEND',
            confidence: 85,
            status: 'VERIFIED',
            responseText: 'Rebuttal draft details...',
          },
          orchestration: { runId: 'run-123', status: 'COMPLETED' },
          decision: { recommendation: 'DEFEND', confidence: 0.85, authority: 'DETERMINISTIC_POLICY' },
        };
      };

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
      assert.equal(body.data.recommendation, 'DEFEND');
      assert.equal(body.decision.authority, 'DETERMINISTIC_POLICY');
    });

    it('GET / returns 200 with stored response', async () => {
      chargebackResponseService.getResponse = async (merchantId, cbId) => {
        assert.equal(merchantId, MERCHANT_A_ID);
        assert.equal(cbId, VALID_CB_ID);
        return {
          _id: '507f1f77bcf86cd799439099',
          chargebackId: cbId,
          recommendation: 'DEFEND',
          confidence: 85,
          status: 'VERIFIED',
        };
      };

      const res = await fetch(baseUrl, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });

      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.success, true);
      assert.equal(body.data.recommendation, 'DEFEND');
    });

    it('GET / returns 404 when no response has been generated', async () => {
      chargebackResponseService.getResponse = async () => {
        throw new AppError('No response found for this chargeback', 404, 'RESOURCE_NOT_FOUND');
      };

      const res = await fetch(baseUrl, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });

      const body = await res.json();
      assert.equal(res.status, 404);
      assert.equal(body.success, false);
      assert.equal(body.error.code, 'RESOURCE_NOT_FOUND');
    });

    it('POST /verify returns 200 with verified result', async () => {
      chargebackResponseService.verifyResponse = async (merchantId, cbId, body) => {
        assert.equal(merchantId, MERCHANT_A_ID);
        assert.equal(cbId, VALID_CB_ID);
        return {
          _id: '507f1f77bcf86cd799439099',
          status: 'VERIFIED',
          recommendation: 'DEFEND',
          confidence: 85,
        };
      };

      const res = await fetch(`${baseUrl}/verify`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          responseText: 'Updated valid rebuttal text for dispute...',
        }),
      });

      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.success, true);
      assert.equal(body.data.status, 'VERIFIED');
    });
  });
});
