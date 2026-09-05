const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const mongoose = require('mongoose');
const app = require('../src/app');
const env = require('../src/config/env');
const { signAccessToken } = require('../src/utils/jwt');
const { Transaction, Merchant, RiskAssessment } = require('../src/models');
const { hashPassword } = require('../src/utils/password');
const {
  sanitizeTransactionForAI,
  formatBaselineForAI,
  analyzeTransactionRisk,
} = require('../src/services/aiRiskService');

const MONGODB_URI = process.env.MONGODB_URI || env.MONGODB_URI;

const TEST_JWT_SECRET = 'test-secret-key-for-ai-risk-integration-suite-998877';
env.JWT_SECRET = TEST_JWT_SECRET;
process.env.JWT_SECRET = TEST_JWT_SECRET;

// Helper to make HTTP requests to the Express server
function makeRequest(baseUrl, options, requestBody = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(options.path, baseUrl);
    const reqOptions = {
      method: options.method || 'GET',
      headers: options.headers || {},
    };

    const req = http.request(url, reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {
          json = data;
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: json,
        });
      });
    });

    req.on('error', reject);

    if (requestBody) {
      req.write(typeof requestBody === 'string' ? requestBody : JSON.stringify(requestBody));
    }
    req.end();
  });
}

describe('AI RISK SERVICE — SANITIZATION & CLIENT UNIT TESTS', () => {
  it('sanitizeTransactionForAI removes prohibited secrets and retains necessary fields', () => {
    const rawTx = {
      _id: '64e0f0000000000000000001',
      externalTransactionId: 'TX-SECRET-TEST',
      amount: 199.99,
      currency: 'USD',
      status: 'PENDING',
      cvv: '123',
      pan: '4111111111111111',
      passwordHash: 'secret-hash',
      jwtToken: 'bearer secret',
      customer: {
        email: 'shopper@test.com',
        phone: '+15551234567',
        customerId: 'CUST-1',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        secretNote: 'internal note',
      },
      paymentMethod: {
        cardBin: '411111',
        cardLast4: '1111',
        cardType: 'VISA',
        issuerCountry: 'US',
        cvv: '999',
      },
      cartItems: [
        { productId: 'P1', title: 'Gift Card', price: 199.99, quantity: 1, category: 'gift_cards' },
      ],
    };

    const sanitized = sanitizeTransactionForAI(rawTx);

    assert.equal(sanitized.id, '64e0f0000000000000000001');
    assert.equal(sanitized.amount, 199.99);
    assert.equal(sanitized.currency, 'USD');
    assert.equal(sanitized.customer.email, 's***r@test.com');
    assert.equal(sanitized.customer.customerId, 'CUST-1');
    assert.equal(sanitized.customer.phone, undefined);
    assert.equal(sanitized.customer.ipAddress, undefined);
    assert.equal(sanitized.customer.userAgent, undefined);
    assert.equal(sanitized.paymentMethod.cardBin, '411111');
    assert.equal(sanitized.paymentMethod.cardLast4, '1111');
    assert.equal(sanitized.cartItems.length, 1);

    // Verify prohibited fields are absent
    assert.equal(sanitized.cvv, undefined);
    assert.equal(sanitized.pan, undefined);
    assert.equal(sanitized.passwordHash, undefined);
    assert.equal(sanitized.jwtToken, undefined);
    assert.equal(sanitized.customer.secretNote, undefined);
    assert.equal(sanitized.paymentMethod.cvv, undefined);
  });

  it('formatBaselineForAI correctly packages deterministic baseline results', () => {
    const baseline = {
      riskScore: 75,
      riskTier: 'HIGH',
      recommendation: 'DECLINE',
      signals: [
        { code: 'HIGH_VALUE_TRANSACTION', description: 'Amount > 5000', severity: 'HIGH', confidence: 0.95 },
      ],
      ruleMatches: [
        { ruleId: 'HIGH_VALUE', points: 40, reason: 'High transaction value' },
      ],
    };

    const formatted = formatBaselineForAI(baseline);
    assert.equal(formatted.riskScore, 75);
    assert.equal(formatted.riskTier, 'HIGH');
    assert.equal(formatted.recommendation, 'DECLINE');
    assert.equal(formatted.signals.length, 1);
    assert.equal(formatted.signals[0].code, 'HIGH_VALUE_TRANSACTION');
    assert.equal(formatted.ruleMatches.length, 1);
  });
});

describe('AI RISK INTEGRATION — MOCK SERVICE & GRACEFUL DEGRADATION', () => {
  let mockAiServer;
  let mockAiPort;
  let mockAiUrl;
  let mockMode = 'SUCCESS'; // 'SUCCESS' | '502' | 'TIMEOUT' | 'MALFORMED' | 'INVALID_SCHEMA'

  before(async () => {
    // Spin up an ephemeral HTTP server to mock the Python AI service
    mockAiServer = http.createServer((req, res) => {
      if (req.url === '/api/v1/analyze/risk' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });

        req.on('end', () => {
          if (mockMode === 'SUCCESS') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                aiScore: 65,
                riskTier: 'MEDIUM',
                recommendation: 'REVIEW',
                riskFactors: [
                  {
                    code: 'ELEVATED_VALUE',
                    description: 'Transaction amount exceeds typical median',
                    severity: 'MEDIUM',
                  },
                ],
                summary: 'AI analyst determined moderate risk due to transaction volume.',
              })
            );
          } else if (mockMode === '502') {
            res.writeHead(502, { 'Content-Type': 'text/plain' });
            res.end('Upstream LLM gateway unavailable');
          } else if (mockMode === 'TIMEOUT') {
            // Do not respond immediately; wait longer than client timeout
            setTimeout(() => {
              if (!res.writableEnded) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ aiScore: 50, riskTier: 'MEDIUM', recommendation: 'REVIEW' }));
              }
            }, 600);
          } else if (mockMode === 'MALFORMED') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end('{"not valid json');
          } else if (mockMode === 'INVALID_SCHEMA') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ aiScore: 150, riskTier: 'INVALID_TIER' }));
          } else if (mockMode === 'FLOAT_SCORE') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ aiScore: 42.5, riskTier: 'MEDIUM', recommendation: 'REVIEW' }));
          }
        });
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise((resolve) => {
      mockAiServer.listen(0, '127.0.0.1', () => {
        mockAiPort = mockAiServer.address().port;
        mockAiUrl = `http://127.0.0.1:${mockAiPort}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (mockAiServer) {
      await new Promise((resolve) => mockAiServer.close(resolve));
    }
  });

  it('analyzeTransactionRisk returns success and structured factors when AI service responds 200', async () => {
    mockMode = 'SUCCESS';
    const tx = { _id: '64e0f0000000000000000001', amount: 350, currency: 'USD' };
    const baseline = { riskScore: 35, riskTier: 'MEDIUM', recommendation: 'REVIEW', signals: [], ruleMatches: [] };

    const result = await analyzeTransactionRisk(tx, baseline, { serviceUrl: mockAiUrl });

    assert.equal(result.success, true);
    assert.equal(result.status, 'SUCCESS');
    assert.equal(result.aiScore, 65);
    assert.equal(result.riskTier, 'MEDIUM');
    assert.equal(result.recommendation, 'REVIEW');
    assert.equal(result.riskFactors.length, 1);
    assert.equal(result.riskFactors[0].code, 'ELEVATED_VALUE');
    assert.match(result.summary, /AI analyst/);
  });

  it('analyzeTransactionRisk gracefully degrades on HTTP 502 upstream error', async () => {
    mockMode = '502';
    const tx = { _id: '64e0f0000000000000000001', amount: 350, currency: 'USD' };
    const baseline = { riskScore: 35, riskTier: 'MEDIUM', recommendation: 'REVIEW', signals: [], ruleMatches: [] };

    const result = await analyzeTransactionRisk(tx, baseline, { serviceUrl: mockAiUrl });

    assert.equal(result.success, false);
    assert.equal(result.status, 'UNAVAILABLE');
    assert.match(result.error, /HTTP 502/);
  });

  it('analyzeTransactionRisk gracefully degrades on timeout', async () => {
    mockMode = 'TIMEOUT';
    const tx = { _id: '64e0f0000000000000000001', amount: 350, currency: 'USD' };
    const baseline = { riskScore: 35, riskTier: 'MEDIUM', recommendation: 'REVIEW', signals: [], ruleMatches: [] };

    // Request with short 100ms timeout
    const result = await analyzeTransactionRisk(tx, baseline, { serviceUrl: mockAiUrl, timeoutMs: 100 });

    assert.equal(result.success, false);
    assert.equal(result.status, 'UNAVAILABLE');
    assert.match(result.error, /timed out/);
  });

  it('analyzeTransactionRisk gracefully degrades on invalid response schema', async () => {
    mockMode = 'INVALID_SCHEMA';
    const tx = { _id: '64e0f0000000000000000001', amount: 350, currency: 'USD' };
    const baseline = { riskScore: 35, riskTier: 'MEDIUM', recommendation: 'REVIEW', signals: [], ruleMatches: [] };

    const result = await analyzeTransactionRisk(tx, baseline, { serviceUrl: mockAiUrl });

    assert.equal(result.success, false);
    assert.equal(result.status, 'FAILED');
    assert.match(result.error, /contract validation/);
  });

  it('analyzeTransactionRisk rejects float aiScore (e.g. 42.5) and returns FAILED status', async () => {
    mockMode = 'FLOAT_SCORE';
    const tx = { _id: '64e0f0000000000000000001', amount: 350, currency: 'USD' };
    const baseline = { riskScore: 35, riskTier: 'MEDIUM', recommendation: 'REVIEW', signals: [], ruleMatches: [] };

    const result = await analyzeTransactionRisk(tx, baseline, { serviceUrl: mockAiUrl });

    assert.equal(result.success, false);
    assert.equal(result.status, 'FAILED');
    assert.match(result.error, /contract validation/);
  });

  it('analyzeTransactionRisk gracefully degrades when service is completely unreachable', async () => {
    const tx = { _id: '64e0f0000000000000000001', amount: 350, currency: 'USD' };
    const baseline = { riskScore: 35, riskTier: 'MEDIUM', recommendation: 'REVIEW', signals: [], ruleMatches: [] };

    // Port 19999 has nothing listening
    const result = await analyzeTransactionRisk(tx, baseline, { serviceUrl: 'http://127.0.0.1:19999' });

    assert.equal(result.success, false);
    assert.equal(result.status, 'UNAVAILABLE');
    assert.ok(result.error);
  });
});

describe('MONGODB LIVE INTEGRATION — AI RISK ANALYSIS & PERSISTENCE', () => {
  if (!MONGODB_URI || MONGODB_URI.trim() === '') {
    it.skip('Skipping live MongoDB AI risk integration tests (MONGODB_URI is not configured)', () => {});
    return;
  }

  let server;
  let baseUrl;
  let mockAiServer;
  let mockAiPort;
  let originalAiUrl;
  let mockAiMode = 'SUCCESS';

  let merchantA;
  let merchantB;
  let tokenA;
  let tokenB;
  let txAId;

  before(async () => {
    // 1. Setup mock AI server
    mockAiServer = http.createServer((req, res) => {
      if (req.url === '/api/v1/analyze/risk' && req.method === 'POST') {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          if (mockAiMode === 'SUCCESS') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                aiScore: 72,
                riskTier: 'HIGH',
                recommendation: 'DECLINE',
                riskFactors: [
                  {
                    code: 'ELEVATED_VALUE',
                    description: 'Transaction amount exceeds standard baseline threshold',
                    severity: 'HIGH',
                  },
                ],
                summary: 'AI analyst flagged elevated transaction value.',
              })
            );
          } else if (mockAiMode === '502') {
            res.writeHead(502, { 'Content-Type': 'text/plain' });
            res.end('LLM gateway unreachable');
          } else if (mockAiMode === 'FLOAT_SCORE') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                aiScore: 42.5,
                riskTier: 'MEDIUM',
                recommendation: 'REVIEW',
                riskFactors: [],
                summary: 'Float score from model',
              })
            );
          }
        });
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise((resolve) => {
      mockAiServer.listen(0, '127.0.0.1', () => {
        mockAiPort = mockAiServer.address().port;
        originalAiUrl = env.AI_SERVICE_URL;
        env.AI_SERVICE_URL = `http://127.0.0.1:${mockAiPort}`;
        resolve();
      });
    });

    // 2. Connect to MongoDB
    await mongoose.connect(MONGODB_URI);

    // 3. Clean up existing test records
    await Promise.all([
      Merchant.deleteMany({ email: { $in: ['ai-risk-a@test.com', 'ai-risk-b@test.com'] } }),
      Transaction.deleteMany({ externalTransactionId: 'AI-TX-A1' }),
    ]);

    // 4. Create merchants & tokens
    const passwordHash = await hashPassword('AiRiskPass123!');
    merchantA = await Merchant.create({
      name: 'AI Test Merchant A',
      email: 'ai-risk-a@test.com',
      passwordHash,
      currency: 'USD',
    });

    merchantB = await Merchant.create({
      name: 'AI Test Merchant B',
      email: 'ai-risk-b@test.com',
      passwordHash,
      currency: 'USD',
    });

    tokenA = signAccessToken(merchantA);
    tokenB = signAccessToken(merchantB);

    // 5. Create transaction for Merchant A
    const txA = await Transaction.create({
      merchantId: merchantA._id,
      externalTransactionId: 'AI-TX-A1',
      amount: 1500,
      currency: 'USD',
      status: 'MANUAL_REVIEW',
      customer: { email: 'buyer@test.com' },
    });
    txAId = txA._id.toString();

    // 6. Start test Express app server
    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (mockAiServer) {
      await new Promise((resolve) => mockAiServer.close(resolve));
    }
    env.AI_SERVICE_URL = originalAiUrl;

    if (mongoose.connection.readyState !== 0) {
      await Promise.all([
        Merchant.deleteMany({ email: { $in: ['ai-risk-a@test.com', 'ai-risk-b@test.com'] } }),
        Transaction.deleteMany({ externalTransactionId: 'AI-TX-A1' }),
        RiskAssessment.deleteMany({ merchantId: { $in: [merchantA?._id, merchantB?._id] } }),
      ]);
      await mongoose.disconnect();
    }
  });

  it('Successfully persists AI risk analysis when AI service is healthy', async () => {
    mockAiMode = 'SUCCESS';

    const res = await makeRequest(
      baseUrl,
      {
        path: `/api/v1/transactions/${txAId}/risk`,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json',
        },
      },
      {}
    );

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.transactionId, txAId);

    // Deterministic baseline maintained
    assert.equal(typeof res.body.data.riskScore, 'number');
    assert.equal(res.body.data.baselineScore, res.body.data.riskScore);

    // AI fields populated
    assert.equal(res.body.data.aiScore, 72);
    assert.ok(res.body.data.aiAnalysis);
    assert.equal(res.body.data.aiAnalysis.status, 'SUCCESS');
    assert.equal(res.body.data.aiAnalysis.aiTier, 'HIGH');
    assert.equal(res.body.data.aiAnalysis.aiRecommendation, 'DECLINE');
    assert.equal(res.body.data.aiAnalysis.riskFactors.length, 1);
    assert.equal(res.body.data.aiAnalysis.riskFactors[0].code, 'ELEVATED_VALUE');
    assert.match(res.body.data.aiAnalysis.summary, /AI analyst/);

    // Verify stored document in MongoDB
    const stored = await RiskAssessment.findOne({ transactionId: txAId }).sort({ createdAt: -1 });
    assert.ok(stored);
    assert.equal(stored.aiScore, 72);
    assert.equal(stored.aiAnalysis.status, 'SUCCESS');
    assert.equal(stored.aiAnalysis.riskFactors.length, 1);
  });

  it('GET /api/v1/transactions/:id/risk returns formatted AI analysis', async () => {
    const res = await makeRequest(baseUrl, {
      path: `/api/v1/transactions/${txAId}/risk`,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${tokenA}`,
      },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.aiScore, 72);
    assert.equal(res.body.data.aiAnalysis.status, 'SUCCESS');
    assert.equal(res.body.data.aiAnalysis.riskFactors[0].code, 'ELEVATED_VALUE');
  });

  it('Gracefully degrades to baseline when AI service returns 502', async () => {
    mockAiMode = '502';

    const res = await makeRequest(
      baseUrl,
      {
        path: `/api/v1/transactions/${txAId}/risk`,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json',
        },
      },
      {}
    );

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.success, true);

    // Baseline remains valid and intact
    assert.equal(typeof res.body.data.riskScore, 'number');
    assert.equal(res.body.data.baselineScore, res.body.data.riskScore);

    // aiScore is null, status is UNAVAILABLE
    assert.equal(res.body.data.aiScore, null);
    assert.ok(res.body.data.aiAnalysis);
    assert.equal(res.body.data.aiAnalysis.status, 'UNAVAILABLE');
    assert.match(res.body.data.aiAnalysis.error, /502/);
  });

  it('Gracefully degrades to baseline when AI service returns float aiScore (e.g. 42.5)', async () => {
    mockAiMode = 'FLOAT_SCORE';

    const res = await makeRequest(
      baseUrl,
      {
        path: `/api/v1/transactions/${txAId}/risk`,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenA}`,
          'Content-Type': 'application/json',
        },
      },
      {}
    );

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.success, true);

    // Baseline remains valid and intact
    assert.equal(typeof res.body.data.riskScore, 'number');
    assert.equal(res.body.data.baselineScore, res.body.data.riskScore);

    // aiScore is null, status is FAILED, invariants did not throw
    assert.equal(res.body.data.aiScore, null);
    assert.ok(res.body.data.aiAnalysis);
    assert.equal(res.body.data.aiAnalysis.status, 'FAILED');
    assert.match(res.body.data.aiAnalysis.error, /contract validation/);
  });

  it('Tenant isolation: Merchant B cannot assess Merchant A transaction', async () => {
    const res = await makeRequest(
      baseUrl,
      {
        path: `/api/v1/transactions/${txAId}/risk`,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenB}`,
          'Content-Type': 'application/json',
        },
      },
      {}
    );

    assert.equal(res.statusCode, 404);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'TRANSACTION_NOT_FOUND');
  });

  it('Tenant isolation: Merchant B cannot retrieve Merchant A assessment', async () => {
    const res = await makeRequest(baseUrl, {
      path: `/api/v1/transactions/${txAId}/risk`,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${tokenB}`,
      },
    });

    assert.equal(res.statusCode, 404);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'TRANSACTION_NOT_FOUND');
  });
});
