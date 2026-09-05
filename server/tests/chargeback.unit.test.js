const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const {
  computeDeadlineStatus,
  validateStatusTransition,
  formatChargeback,
  createChargeback,
  getChargebacks,
  getChargebackById,
  updateChargebackStatus,
} = require('../src/services/chargebackService');
const { Chargeback, Transaction, AuditLog } = require('../src/models');
const AppError = require('../src/utils/AppError');

describe('PHASE 2M — CHARGEBACK MANAGEMENT SERVICE (UNIT TESTS)', () => {
  const MERCHANT_ID = '507f1f77bcf86cd799439011';
  const TX_ID = '507f1f77bcf86cd799439022';
  const CB_ID = '507f1f77bcf86cd799439033';

  // =========================================================================
  // 1. DEADLINE STATUS CALCULATION
  // =========================================================================
  describe('1. computeDeadlineStatus', () => {
    const fixedNow = new Date('2026-09-05T12:00:00.000Z');

    it('returns COMPLETED for terminal status WON regardless of date', () => {
      const past = new Date('2026-09-01T00:00:00.000Z');
      const future = new Date('2026-09-20T00:00:00.000Z');
      assert.equal(computeDeadlineStatus(past, 'WON', fixedNow), 'COMPLETED');
      assert.equal(computeDeadlineStatus(future, 'WON', fixedNow), 'COMPLETED');
    });

    it('returns COMPLETED for terminal status LOST regardless of date', () => {
      const past = new Date('2026-09-01T00:00:00.000Z');
      assert.equal(computeDeadlineStatus(past, 'LOST', fixedNow), 'COMPLETED');
    });

    it('returns COMPLETED for terminal status CLOSED regardless of date', () => {
      const past = new Date('2026-09-01T00:00:00.000Z');
      assert.equal(computeDeadlineStatus(past, 'CLOSED', fixedNow), 'COMPLETED');
    });

    it('returns OVERDUE when deadline is in the past for active status', () => {
      const past = new Date('2026-09-05T11:59:59.000Z');
      assert.equal(computeDeadlineStatus(past, 'OPEN', fixedNow), 'OVERDUE');
      assert.equal(computeDeadlineStatus(past, 'UNDER_REVIEW', fixedNow), 'OVERDUE');
    });

    it('returns DUE_SOON when deadline is within 3 days (<= 72 hours)', () => {
      const dueIn2Days = new Date('2026-09-07T12:00:00.000Z');
      assert.equal(computeDeadlineStatus(dueIn2Days, 'OPEN', fixedNow), 'DUE_SOON');

      const dueInExact3Days = new Date('2026-09-08T12:00:00.000Z');
      assert.equal(computeDeadlineStatus(dueInExact3Days, 'UNDER_REVIEW', fixedNow), 'DUE_SOON');
    });

    it('returns UPCOMING when deadline is more than 3 days in the future', () => {
      const dueIn10Days = new Date('2026-09-15T12:00:00.000Z');
      assert.equal(computeDeadlineStatus(dueIn10Days, 'OPEN', fixedNow), 'UPCOMING');
      assert.equal(computeDeadlineStatus(dueIn10Days, 'RESPONSE_READY', fixedNow), 'UPCOMING');
    });
  });

  // =========================================================================
  // 2. STATE TRANSITION VALIDATION
  // =========================================================================
  describe('2. validateStatusTransition', () => {
    it('allows valid sequential transitions', () => {
      assert.doesNotThrow(() => validateStatusTransition('OPEN', 'UNDER_REVIEW'));
      assert.doesNotThrow(() => validateStatusTransition('UNDER_REVIEW', 'RESPONSE_READY'));
      assert.doesNotThrow(() => validateStatusTransition('RESPONSE_READY', 'SUBMITTED'));
      assert.doesNotThrow(() => validateStatusTransition('SUBMITTED', 'WON'));
      assert.doesNotThrow(() => validateStatusTransition('SUBMITTED', 'LOST'));
      assert.doesNotThrow(() => validateStatusTransition('WON', 'CLOSED'));
      assert.doesNotThrow(() => validateStatusTransition('LOST', 'CLOSED'));
    });

    it('allows closing from intermediate active states', () => {
      assert.doesNotThrow(() => validateStatusTransition('OPEN', 'CLOSED'));
      assert.doesNotThrow(() => validateStatusTransition('UNDER_REVIEW', 'CLOSED'));
      assert.doesNotThrow(() => validateStatusTransition('RESPONSE_READY', 'CLOSED'));
    });

    it('rejects transitioning to the same status', () => {
      assert.throws(
        () => validateStatusTransition('OPEN', 'OPEN'),
        (err) => err instanceof AppError && err.code === 'INVALID_CHARGEBACK_TRANSITION'
      );
      assert.throws(
        () => validateStatusTransition('UNDER_REVIEW', 'UNDER_REVIEW'),
        (err) => err instanceof AppError && err.code === 'INVALID_CHARGEBACK_TRANSITION'
      );
    });

    it('rejects illegal backward transitions', () => {
      assert.throws(
        () => validateStatusTransition('WON', 'OPEN'),
        (err) => err instanceof AppError && err.code === 'INVALID_CHARGEBACK_TRANSITION'
      );
      assert.throws(
        () => validateStatusTransition('LOST', 'UNDER_REVIEW'),
        (err) => err instanceof AppError && err.code === 'INVALID_CHARGEBACK_TRANSITION'
      );
      assert.throws(
        () => validateStatusTransition('SUBMITTED', 'OPEN'),
        (err) => err instanceof AppError && err.code === 'INVALID_CHARGEBACK_TRANSITION'
      );
    });

    it('rejects illegal forward skips', () => {
      assert.throws(
        () => validateStatusTransition('OPEN', 'WON'),
        (err) => err instanceof AppError && err.code === 'INVALID_CHARGEBACK_TRANSITION'
      );
      assert.throws(
        () => validateStatusTransition('OPEN', 'SUBMITTED'),
        (err) => err instanceof AppError && err.code === 'INVALID_CHARGEBACK_TRANSITION'
      );
    });

    it('rejects all transitions from terminal CLOSED state', () => {
      const allStatuses = Chargeback.CHARGEBACK_STATUSES;
      for (const target of allStatuses) {
        assert.throws(
          () => validateStatusTransition('CLOSED', target),
          (err) => err instanceof AppError && err.code === 'INVALID_CHARGEBACK_TRANSITION'
        );
      }
    });
  });

  // =========================================================================
  // 3. RESPONSE SANITIZATION & FORMATTER
  // =========================================================================
  describe('3. formatChargeback', () => {
    it('formats chargeback document and excludes sensitive data', () => {
      const mockDoc = {
        _id: new mongoose.Types.ObjectId(CB_ID),
        merchantId: new mongoose.Types.ObjectId(MERCHANT_ID),
        transactionId: new mongoose.Types.ObjectId(TX_ID),
        caseNumber: 'CASE-TEST-1',
        network: 'VISA',
        reasonCode: '10.4',
        reasonDescription: 'Fraudulent Transaction',
        disputeAmount: 150.0,
        deadlineDate: new Date('2026-09-20T00:00:00.000Z'),
        status: 'OPEN',
        generatedResponse: null,
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
        updatedAt: new Date('2026-09-01T00:00:00.000Z'),
        // Sensitive fields that must NEVER appear
        password: 'secretPassword123',
        pan: '4111111111111111',
        cvv: '123',
        __v: 0,
      };

      const formatted = formatChargeback(mockDoc, {
        now: new Date('2026-09-05T00:00:00.000Z'),
      });

      assert.equal(formatted.id, CB_ID);
      assert.equal(formatted.merchantId, MERCHANT_ID);
      assert.equal(formatted.transactionId, TX_ID);
      assert.equal(formatted.caseNumber, 'CASE-TEST-1');
      assert.equal(formatted.network, 'VISA');
      assert.equal(formatted.reasonCode, '10.4');
      assert.equal(formatted.reasonDescription, 'Fraudulent Transaction');
      assert.equal(formatted.disputeAmount, 150.0);
      assert.equal(formatted.deadlineStatus, 'UPCOMING');
      assert.equal(formatted.status, 'OPEN');

      // Ensure no sensitive fields leak
      assert.equal(formatted.password, undefined);
      assert.equal(formatted.pan, undefined);
      assert.equal(formatted.cvv, undefined);
      assert.equal(formatted.__v, undefined);
    });

    it('safely formats populated transaction details without customer PII', () => {
      const mockDoc = {
        _id: new mongoose.Types.ObjectId(CB_ID),
        merchantId: new mongoose.Types.ObjectId(MERCHANT_ID),
        transactionId: {
          _id: new mongoose.Types.ObjectId(TX_ID),
          externalTransactionId: 'EXT-TX-99',
          amount: 150.0,
          currency: 'USD',
          status: 'MANUAL_REVIEW',
          timestamp: new Date('2026-08-30T00:00:00.000Z'),
          customer: {
            email: 'victim@example.com',
            phone: '555-1234',
            ipAddress: '192.168.1.1',
          },
        },
        caseNumber: 'CASE-TEST-2',
        network: 'MASTERCARD',
        reasonCode: '4837',
        disputeAmount: 150.0,
        deadlineDate: new Date('2026-09-10T00:00:00.000Z'),
        status: 'UNDER_REVIEW',
      };

      const formatted = formatChargeback(mockDoc);

      assert.ok(formatted.transaction);
      assert.equal(formatted.transaction.id, TX_ID);
      assert.equal(formatted.transaction.externalTransactionId, 'EXT-TX-99');
      assert.equal(formatted.transaction.amount, 150.0);
      assert.equal(formatted.transaction.currency, 'USD');

      // Sensitive customer PII from populated transaction must be stripped
      assert.equal(formatted.transaction.customer, undefined);
    });
  });

  // =========================================================================
  // 4. SERVICE METHOD INTEGRITY & MODEL INVOCATIONS
  // =========================================================================
  describe('4. Service Methods (create, get, list, update)', () => {
    let originalTxFindOne;
    let originalCbFindOne;
    let originalCbCreate;
    let originalCbFind;
    let originalCbCount;

    beforeEach(() => {
      originalTxFindOne = Transaction.findOne;
      originalCbFindOne = Chargeback.findOne;
      originalCbCreate = Chargeback.create;
      originalCbFind = Chargeback.find;
      originalCbCount = Chargeback.countDocuments;
    });

    afterEach(() => {
      Transaction.findOne = originalTxFindOne;
      Chargeback.findOne = originalCbFindOne;
      Chargeback.create = originalCbCreate;
      Chargeback.find = originalCbFind;
      Chargeback.countDocuments = originalCbCount;
    });

    it('createChargeback rejects if transaction does not exist for merchant (404)', async () => {
      Transaction.findOne = async () => null;

      await assert.rejects(
        () =>
          createChargeback(MERCHANT_ID, {
            caseNumber: 'CASE-404',
            transactionId: TX_ID,
            network: 'VISA',
            reasonCode: '10.4',
            disputeAmount: 100.0,
            deadline: new Date(),
          }),
        (err) => err instanceof AppError && err.code === 'TRANSACTION_NOT_FOUND' && err.statusCode === 404
      );
    });

    it('createChargeback rejects dispute amount mismatch with transaction (400)', async () => {
      Transaction.findOne = async () => ({
        _id: new mongoose.Types.ObjectId(TX_ID),
        amount: 250.0,
      });

      await assert.rejects(
        () =>
          createChargeback(MERCHANT_ID, {
            caseNumber: 'CASE-MISMATCH',
            transactionId: TX_ID,
            network: 'VISA',
            reasonCode: '10.4',
            disputeAmount: 100.0, // Does not match $250.0
            deadline: new Date(),
          }),
        (err) => err instanceof AppError && err.code === 'VALIDATION_ERROR' && err.statusCode === 400
      );
    });

    it('createChargeback rejects duplicate caseNumber for merchant (409)', async () => {
      Transaction.findOne = async () => ({
        _id: new mongoose.Types.ObjectId(TX_ID),
        amount: 100.0,
      });
      Chargeback.findOne = async () => ({ _id: new mongoose.Types.ObjectId(CB_ID) });

      await assert.rejects(
        () =>
          createChargeback(MERCHANT_ID, {
            caseNumber: 'CASE-DUPLICATE',
            transactionId: TX_ID,
            network: 'VISA',
            reasonCode: '10.4',
            disputeAmount: 100.0,
            deadline: new Date(),
          }),
        (err) => err instanceof AppError && err.code === 'DUPLICATE_CHARGEBACK' && err.statusCode === 409
      );
    });

    it('createChargeback strips client-supplied merchantId and creates case', async () => {
      Transaction.findOne = async () => ({
        _id: new mongoose.Types.ObjectId(TX_ID),
        amount: 100.0,
      });
      Chargeback.findOne = async () => null;

      let createdPayload;
      Chargeback.create = async (payload) => {
        createdPayload = payload;
        return {
          ...payload,
          _id: new mongoose.Types.ObjectId(CB_ID),
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      };

      const result = await createChargeback(MERCHANT_ID, {
        merchantId: 'ATTACKER_OVERRIDE_MERCHANT_ID',
        caseNumber: 'CASE-OK-1',
        transactionId: TX_ID,
        network: 'VISA',
        reasonCode: '10.4',
        disputeAmount: 100.0,
        deadline: new Date('2026-09-25T00:00:00.000Z'),
      });

      assert.equal(createdPayload.merchantId, MERCHANT_ID);
      assert.equal(result.caseNumber, 'CASE-OK-1');
      assert.equal(result.status, 'OPEN');
    });

    it('getChargebackById throws 404 if not found', async () => {
      Chargeback.findOne = async () => null;

      await assert.rejects(
        () => getChargebackById(MERCHANT_ID, CB_ID),
        (err) => err instanceof AppError && err.code === 'CHARGEBACK_NOT_FOUND' && err.statusCode === 404
      );
    });

    it('updateChargebackStatus updates status and records transition', async () => {
      let saved = false;
      const mockCb = {
        _id: new mongoose.Types.ObjectId(CB_ID),
        merchantId: new mongoose.Types.ObjectId(MERCHANT_ID),
        transactionId: new mongoose.Types.ObjectId(TX_ID),
        caseNumber: 'CASE-STATUS',
        network: 'VISA',
        reasonCode: '10.4',
        disputeAmount: 100.0,
        deadlineDate: new Date(),
        status: 'OPEN',
        createdAt: new Date(),
        updatedAt: new Date(),
        save: async () => {
          saved = true;
        },
      };

      Chargeback.findOne = async () => mockCb;

      const updated = await updateChargebackStatus(
        MERCHANT_ID,
        CB_ID,
        'UNDER_REVIEW',
        'Review started by risk ops'
      );

      assert.equal(saved, true);
      assert.equal(mockCb.status, 'UNDER_REVIEW');
      assert.equal(updated.status, 'UNDER_REVIEW');
    });
  });
});
