/**
 * Tests for Dashboard Statistics & Agent Traces API endpoints.
 */

'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const mongoose = require('mongoose');
const app = require('../src/app');
const env = require('../src/config/env');
const { Merchant, Transaction, Chargeback, AgentTrace } = require('../src/models');
const { hashPassword } = require('../src/utils/password');
const { signAccessToken } = require('../src/utils/jwt');

const MONGODB_URI = process.env.MONGODB_URI || env.MONGODB_URI;

const TEST_JWT_SECRET = 'test-secret-key-for-riskyplay-dash-suite-12345';
env.JWT_SECRET = TEST_JWT_SECRET;
process.env.JWT_SECRET = TEST_JWT_SECRET;

describe('PHASE 3A — DASHBOARD & TRACES ENDPOINTS', () => {
  if (!MONGODB_URI || MONGODB_URI.trim() === '') {
    it.skip('Skipping dashboard/trace tests (MONGODB_URI is not configured)', () => {});
    return;
  }

  let server;
  let baseUrl;
  let merchant;
  let token;
  let transaction;
  let chargeback;
  let trace;

  before(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGODB_URI);
    }

    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    const passwordHash = await hashPassword('TestPassword123!');
    merchant = await Merchant.create({
      name: 'Dashboard Test Merchant',
      email: `dash-${Date.now()}@example.com`,
      passwordHash,
    });
    token = signAccessToken({ _id: merchant._id });

    transaction = await Transaction.create({
      merchantId: merchant._id,
      amount: 150,
      currency: 'USD',
      status: 'COMPLETED',
      paymentMethod: 'CREDIT_CARD',
      cardholder: 'Test User',
      email: 'test@example.com',
      billingAddress: {
        line1: '123 Main St',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
        country: 'US',
      },
    });

    chargeback = await Chargeback.create({
      merchantId: merchant._id,
      transactionId: transaction._id,
      reasonCode: '10.4',
      reasonDescription: 'Fraudulent Transaction',
      disputeCategory: 'FRAUD',
      amount: 150,
      currency: 'USD',
      status: 'INVESTIGATING',
      disputeDate: new Date(),
    });

    trace = await AgentTrace.create({
      runId: 'run-test-123',
      entityType: 'TRANSACTION_RISK',
      entityId: transaction._id,
      agentName: 'TRANSACTION_RISK_BASELINE',
      stepIndex: 0,
      status: 'COMPLETED',
      reasoning: 'Evaluated deterministic baseline rules.',
      outputData: { score: 10, tier: 'LOW' },
      modelUsed: 'deterministic-rules',
      tokensUsed: 0,
      latencyMs: 12,
    });
  });

  after(async () => {
    if (merchant) {
      await Promise.all([
        Merchant.deleteOne({ _id: merchant._id }),
        Transaction.deleteMany({ merchantId: merchant._id }),
        Chargeback.deleteMany({ merchantId: merchant._id }),
        AgentTrace.deleteMany({ entityId: transaction._id }),
      ]);
    }
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  async function request(path, options = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, baseUrl);
      const req = http.request(
        url,
        {
          method: options.method || 'GET',
          headers: options.headers || {},
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            let data;
            try {
              data = JSON.parse(body);
            } catch {
              data = body;
            }
            resolve({ status: res.statusCode, data });
          });
        }
      );
      req.on('error', reject);
      if (options.body) {
        req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
      }
      req.end();
    });
  }

  it('GET /api/v1/dashboard/stats returns aggregated stats for merchant', async () => {
    const res = await request('/api/v1/dashboard/stats', {
      headers: { Authorization: `Bearer ${token}` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.transactions.totalCount, 1);
    assert.equal(res.data.data.transactions.totalVolume, 150);
    assert.equal(res.data.data.chargebacks.totalCount, 1);
    assert.equal(res.data.data.defenseMetrics.agentTracesCount, 1);
  });

  it('GET /api/v1/traces lists traces for merchant', async () => {
    const res = await request('/api/v1/traces', {
      headers: { Authorization: `Bearer ${token}` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.ok(Array.isArray(res.data.data));
    assert.equal(res.data.data.length, 1);
    assert.equal(res.data.data[0].agentName, 'TRANSACTION_RISK_BASELINE');
  });

  it('GET /api/v1/transactions/:id/traces retrieves traces for single transaction', async () => {
    const res = await request(`/api/v1/transactions/${transaction._id}/traces`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.ok(Array.isArray(res.data.data));
    assert.equal(res.data.data.length, 1);
    assert.equal(res.data.data[0].runId, 'run-test-123');
  });

  it('GET /api/v1/chargebacks/:id/traces handles chargeback traces lookup', async () => {
    const res = await request(`/api/v1/chargebacks/${chargeback._id}/traces`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.ok(Array.isArray(res.data.data));
    assert.equal(res.data.data.length, 0);
  });
});
