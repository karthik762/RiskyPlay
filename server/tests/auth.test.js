const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const mongoose = require('mongoose');
const app = require('../src/app');
const env = require('../src/config/env');
const { Merchant } = require('../src/models');
const { hashPassword } = require('../src/utils/password');
const { signAccessToken } = require('../src/utils/jwt');

const TEST_JWT_SECRET = 'test-secret-key-for-riskyplay-isolation-suite-12345';
env.JWT_SECRET = TEST_JWT_SECRET;
process.env.JWT_SECRET = TEST_JWT_SECRET;

describe('AUTHENTICATION & MERCHANT PROFILE TESTS', () => {
  let server;
  let baseUrl;

  before(async () => {
    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}/api/v1/auth`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  describe('POST /api/v1/auth/signup', () => {
    let originalFindOne;
    let originalCreate;

    beforeEach(() => {
      originalFindOne = Merchant.findOne;
      originalCreate = Merchant.create;
    });

    afterEach(() => {
      Merchant.findOne = originalFindOne;
      Merchant.create = originalCreate;
    });

    it('Successfully registers a new merchant and returns safe profile with token', async () => {
      Merchant.findOne = async () => null;
      Merchant.create = async (doc) => ({
        _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439011'),
        name: doc.name,
        email: doc.email,
        currency: doc.currency,
        businessProfile: doc.businessProfile,
        riskThresholds: { blockScore: 85, reviewScore: 50 },
        createdAt: new Date(),
      });

      const res = await fetch(`${baseUrl}/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Acme Store',
          email: 'acme@example.com',
          password: 'Password123!',
          currency: 'USD',
        }),
      });

      const data = await res.json();
      assert.equal(res.status, 201);
      assert.equal(data.success, true);
      assert.equal(data.data.merchant.email, 'acme@example.com');
      assert.equal(typeof data.data.token, 'string');
      assert.equal(data.data.merchant.passwordHash, undefined);
    });

    it('Rejects duplicate email with 409 MERCHANT_ALREADY_EXISTS', async () => {
      Merchant.findOne = async () => ({ _id: 'existing' });

      const res = await fetch(`${baseUrl}/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Duplicate',
          email: 'duplicate@example.com',
          password: 'Password123!',
        }),
      });

      const data = await res.json();
      assert.equal(res.status, 409);
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'MERCHANT_ALREADY_EXISTS');
    });

    it('Rejects weak password with 400 VALIDATION_ERROR', async () => {
      const res = await fetch(`${baseUrl}/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Weak Pass',
          email: 'weak@example.com',
          password: 'short',
        }),
      });

      const data = await res.json();
      assert.equal(res.status, 400);
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'VALIDATION_ERROR');
    });
  });

  describe('POST /api/v1/auth/login', () => {
    let originalFindOne;

    beforeEach(() => {
      originalFindOne = Merchant.findOne;
    });

    afterEach(() => {
      Merchant.findOne = originalFindOne;
    });

    it('Logs in successfully with correct credentials', async () => {
      const passwordHash = await hashPassword('CorrectPassword1!');
      Merchant.findOne = () => ({
        select: () => ({
          _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439011'),
          name: 'Login Store',
          email: 'login@example.com',
          passwordHash,
          currency: 'USD',
          riskThresholds: {},
          createdAt: new Date(),
        }),
      });

      const res = await fetch(`${baseUrl}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'login@example.com',
          password: 'CorrectPassword1!',
        }),
      });

      const data = await res.json();
      assert.equal(res.status, 200);
      assert.equal(data.success, true);
      assert.equal(typeof data.data.token, 'string');
      assert.equal(data.data.merchant.email, 'login@example.com');
    });

    it('Rejects invalid password with 401 INVALID_CREDENTIALS', async () => {
      const passwordHash = await hashPassword('CorrectPassword1!');
      Merchant.findOne = () => ({
        select: () => ({
          _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439011'),
          passwordHash,
        }),
      });

      const res = await fetch(`${baseUrl}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'login@example.com',
          password: 'WrongPassword999!',
        }),
      });

      const data = await res.json();
      assert.equal(res.status, 401);
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'INVALID_CREDENTIALS');
    });
  });

  describe('GET /api/v1/auth/me', () => {
    let originalFindById;

    beforeEach(() => {
      originalFindById = Merchant.findById;
    });

    afterEach(() => {
      Merchant.findById = originalFindById;
    });

    it('Returns authenticated merchant profile with valid token', async () => {
      const merchantId = '507f1f77bcf86cd799439011';
      const token = signAccessToken({ _id: merchantId });

      Merchant.findById = async (id) => ({
        _id: new mongoose.Types.ObjectId(id),
        name: 'Profile Store',
        email: 'profile@example.com',
        currency: 'USD',
        riskThresholds: {},
        createdAt: new Date(),
      });

      const res = await fetch(`${baseUrl}/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      assert.equal(res.status, 200);
      assert.equal(data.success, true);
      assert.equal(data.data.merchant.id, merchantId);
      assert.equal(data.data.merchant.email, 'profile@example.com');
    });

    it('Returns 401 when GET /me is requested without token', async () => {
      const res = await fetch(`${baseUrl}/me`);
      const data = await res.json();

      assert.equal(res.status, 401);
      assert.equal(data.success, false);
      assert.equal(data.error.code, 'AUTHENTICATION_REQUIRED');
    });
  });
});
