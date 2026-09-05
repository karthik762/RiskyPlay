const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const mongoose = require('mongoose');
const app = require('../src/app');
const env = require('../src/config/env');
const { signAccessToken } = require('../src/utils/jwt');
const { Transaction, AgentTrace, Merchant } = require('../src/models');
const { hashPassword } = require('../src/utils/password');

const MONGODB_URI = process.env.MONGODB_URI || env.MONGODB_URI;

const TEST_JWT_SECRET = 'test-secret-key-for-orchestrator-api-suite-12345';
env.JWT_SECRET = TEST_JWT_SECRET;
process.env.JWT_SECRET = TEST_JWT_SECRET;

const MERCHANT_A_ID = '507f1f77bcf86cd799439011';
const MERCHANT_B_ID = '507f1f77bcf86cd799439022';

const tokenA = signAccessToken({ _id: MERCHANT_A_ID });
const tokenB = signAccessToken({ _id: MERCHANT_B_ID });

async function makeRequest(baseUrl, options, requestBody = null) {
  const url = `${baseUrl}${options.path.startsWith('/') ? '' : '/'}${options.path}`;
  const headers = { ...(options.headers || {}) };
  if (requestBody && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: requestBody ? (typeof requestBody === 'string' ? requestBody : JSON.stringify(requestBody)) : undefined,
  });

  let json;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  return {
    statusCode: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body: json,
  };
}

describe('MULTI-AGENT ORCHESTRATOR API & TENANT ISOLATION (MOCK SUITE)', () => {
  let server;
  let baseUrl;

  let mockTransactions = [];
  let capturedTraces = [];

  let originalTxFindOne;
  let originalTraceCreate;

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
    mockTransactions = [
      {
        _id: new mongoose.Types.ObjectId('64a1b2c3d4e5f6a7b8c9d001'),
        merchantId: new mongoose.Types.ObjectId(MERCHANT_A_ID),
        externalTransactionId: 'TX-ORCH-A-001',
        amount: 850.0,
        currency: 'USD',
        customer: { email: 'alice@example.com' },
        cartItems: [{ title: 'Gadget', price: 850.0, quantity: 1 }],
        status: 'PENDING',
        createdAt: new Date(),
      },
      {
        _id: new mongoose.Types.ObjectId('64a1b2c3d4e5f6a7b8c9d002'),
        merchantId: new mongoose.Types.ObjectId(MERCHANT_B_ID),
        externalTransactionId: 'TX-ORCH-B-001',
        amount: 30.0,
        currency: 'USD',
        customer: { email: 'bob@example.com' },
        cartItems: [{ title: 'Book', price: 30.0, quantity: 1 }],
        status: 'PENDING',
        createdAt: new Date(),
      },
    ];

    capturedTraces = [];

    // Mock Transaction.findOne
    originalTxFindOne = Transaction.findOne;
    Transaction.findOne = (query) => {
      const idStr = query._id ? query._id.toString() : null;
      const merchantIdStr = query.merchantId ? query.merchantId.toString() : null;

      const found = mockTransactions.find((t) => {
        const matchesId = idStr ? t._id.toString() === idStr : true;
        const matchesMerchant = merchantIdStr ? t.merchantId.toString() === merchantIdStr : true;
        return matchesId && matchesMerchant;
      });

      return {
        lean: () => Promise.resolve(found ? JSON.parse(JSON.stringify(found)) : null),
        then: (resolve) => resolve(found || null),
      };
    };

    // Mock AgentTrace.create
    originalTraceCreate = AgentTrace.create;
    AgentTrace.create = async (traceData) => {
      capturedTraces.push(traceData);
      return traceData;
    };
  });

  afterEach(() => {
    Transaction.findOne = originalTxFindOne;
    AgentTrace.create = originalTraceCreate;
  });

  it('POST /:id/risk/orchestrate — rejects unauthenticated requests with 401', async () => {
    const res = await makeRequest(baseUrl, {
      path: '/64a1b2c3d4e5f6a7b8c9d001/risk/orchestrate',
      method: 'POST',
    });

    assert.equal(res.statusCode, 401);
    assert.equal(res.body.success, false);
  });

  it('POST /:id/risk/orchestrate — rejects invalid token with 401', async () => {
    const res = await makeRequest(baseUrl, {
      path: '/64a1b2c3d4e5f6a7b8c9d001/risk/orchestrate',
      method: 'POST',
      headers: { Authorization: 'Bearer invalid.token.payload' },
    });

    assert.equal(res.statusCode, 401);
    assert.equal(res.body.success, false);
  });

  it('POST /:id/risk/orchestrate — validates transaction ObjectId format and returns 400', async () => {
    const res = await makeRequest(baseUrl, {
      path: '/not-an-object-id/risk/orchestrate',
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
    });

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
  });

  it('POST /:id/risk/orchestrate — enforces tenant isolation (Merchant B accessing Merchant A tx returns 404)', async () => {
    const res = await makeRequest(baseUrl, {
      path: '/64a1b2c3d4e5f6a7b8c9d001/risk/orchestrate',
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenB}` },
    });

    assert.equal(res.statusCode, 404);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'TRANSACTION_NOT_FOUND');
  });

  it('POST /:id/risk/orchestrate — successfully orchestrates Merchant A tx with baseline risk agent', async () => {
    const res = await makeRequest(baseUrl, {
      path: '/64a1b2c3d4e5f6a7b8c9d001/risk/orchestrate',
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);

    const data = res.body.data;
    assert.ok(data.runId, 'runId must be present');
    assert.equal(typeof data.runId, 'string');
    assert.equal(data.transactionId, '64a1b2c3d4e5f6a7b8c9d001');
    assert.equal(data.merchantId, MERCHANT_A_ID);
    assert.equal(data.status, 'COMPLETED');
    assert.ok(Array.isArray(data.agents));
    assert.equal(data.agents.length, 1);

    const baselineAgent = data.agents[0];
    assert.equal(baselineAgent.agentName, 'TRANSACTION_RISK_BASELINE');
    assert.equal(baselineAgent.status, 'COMPLETED');
    assert.ok(baselineAgent.output);
    assert.equal(typeof baselineAgent.output.riskScore, 'number');
    assert.ok(['LOW', 'MEDIUM', 'HIGH'].includes(baselineAgent.output.riskTier));
    assert.ok(['APPROVE', 'REVIEW', 'DECLINE'].includes(baselineAgent.output.recommendation));
    assert.ok(Array.isArray(baselineAgent.output.matchedRules));
    assert.ok(Array.isArray(baselineAgent.output.signals));

    // Check finalResult mirrors baseline output
    assert.ok(data.finalResult);
    assert.ok(data.finalResult.primaryAssessment);
    assert.equal(data.finalResult.primaryAssessment.riskScore, baselineAgent.output.riskScore);

    // Check trace was recorded via mock
    assert.equal(capturedTraces.length, 1);
    const trace = capturedTraces[0];
    assert.equal(trace.runId, data.runId);
    assert.equal(trace.entityType, 'TRANSACTION_RISK');
    assert.equal(trace.agentName, 'TRANSACTION_RISK_BASELINE');
    assert.equal(trace.status, 'COMPLETED');
    assert.equal(trace.stepIndex, 0);
    assert.ok(trace.latencyMs >= 0);
  });
});

describe('MULTI-AGENT ORCHESTRATOR API — LIVE MONGODB INTEGRATION', () => {
  if (!MONGODB_URI || MONGODB_URI.trim() === '') {
    it.skip('Skipping live MongoDB orchestrator integration tests (MONGODB_URI is not configured)', () => {});
    return;
  }

  let server;
  let baseUrl;
  let merchantA;
  let merchantB;
  let liveTokenA;
  let liveTokenB;
  let txAId;

  before(async () => {
    await mongoose.connect(MONGODB_URI);

    // Clean up previous test entities
    await Promise.all([
      Merchant.deleteMany({ email: { $in: ['orch-a@test.com', 'orch-b@test.com'] } }),
      Transaction.deleteMany({ externalTransactionId: { $in: ['ORCH-LIVE-TX-1', 'ORCH-LIVE-TX-2'] } }),
    ]);

    const passwordHash = await hashPassword('OrchPass123!');
    merchantA = await Merchant.create({
      name: 'Orchestrator Merchant A',
      email: 'orch-a@test.com',
      passwordHash,
      currency: 'USD',
    });

    merchantB = await Merchant.create({
      name: 'Orchestrator Merchant B',
      email: 'orch-b@test.com',
      passwordHash,
      currency: 'USD',
    });

    liveTokenA = signAccessToken(merchantA);
    liveTokenB = signAccessToken(merchantB);

    const txA = await Transaction.create({
      merchantId: merchantA._id,
      externalTransactionId: 'ORCH-LIVE-TX-1',
      amount: 1500.0,
      currency: 'USD',
      customer: { email: 'buyer.orch@example.com' },
      cartItems: [{ title: 'Item 1', price: 100.0, quantity: 1 }], // Total mismatch signal
    });
    txAId = txA._id.toString();

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
      if (merchantA && merchantB) {
        await Promise.all([
          Merchant.deleteMany({ _id: { $in: [merchantA._id, merchantB._id] } }),
          Transaction.deleteMany({ externalTransactionId: { $in: ['ORCH-LIVE-TX-1', 'ORCH-LIVE-TX-2'] } }),
          AgentTrace.deleteMany({ entityId: txAId }),
        ]);
      }
      await mongoose.disconnect();
    }
  });

  it('POST /:id/risk/orchestrate — executes pipeline and persists AgentTrace to live MongoDB', async () => {
    const res = await makeRequest(baseUrl, {
      path: `/${txAId}/risk/orchestrate`,
      method: 'POST',
      headers: { Authorization: `Bearer ${liveTokenA}` },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);

    const data = res.body.data;
    assert.ok(data.runId);
    assert.equal(data.status, 'COMPLETED');
    assert.equal(data.agents.length, 1);
    assert.equal(data.agents[0].agentName, 'TRANSACTION_RISK_BASELINE');

    // Query persisted AgentTrace from MongoDB
    const traces = await AgentTrace.find({ runId: data.runId }).lean();
    assert.equal(traces.length, 1);

    const trace = traces[0];
    assert.equal(trace.runId, data.runId);
    assert.equal(trace.entityType, 'TRANSACTION_RISK');
    assert.equal(trace.entityId.toString(), txAId);
    assert.equal(trace.agentName, 'TRANSACTION_RISK_BASELINE');
    assert.equal(trace.stepIndex, 0);
    assert.equal(trace.status, 'COMPLETED');
    assert.ok(trace.latencyMs >= 0);

    // Verify operational reasoning (NOT raw chain of thought)
    assert.ok(trace.reasoning);
    assert.ok(trace.reasoning.includes('DETERMINISTIC_BASELINE'));

    // Verify outputData contains risk results
    assert.ok(trace.outputData);
    assert.equal(typeof trace.outputData.riskScore, 'number');
    assert.ok(['LOW', 'MEDIUM', 'HIGH'].includes(trace.outputData.riskTier));

    // Verify no forbidden PII or secrets in inputData
    assert.ok(trace.inputData);
    assert.equal(trace.inputData.transactionId, txAId);
    assert.equal(trace.inputData.amount, 1500.0);
    assert.equal(trace.inputData.cvv, undefined);
    assert.equal(trace.inputData.pan, undefined);
    assert.equal(trace.inputData.password, undefined);
  });

  it('POST /:id/risk/orchestrate — cross-tenant call returns 404 and writes no traces', async () => {
    const initialTraceCount = await AgentTrace.countDocuments({ entityId: txAId });

    const res = await makeRequest(baseUrl, {
      path: `/${txAId}/risk/orchestrate`,
      method: 'POST',
      headers: { Authorization: `Bearer ${liveTokenB}` },
    });

    assert.equal(res.statusCode, 404);
    assert.equal(res.body.success, false);

    const postTraceCount = await AgentTrace.countDocuments({ entityId: txAId });
    assert.equal(postTraceCount, initialTraceCount, 'No new trace should be created on 404');
  });
});
