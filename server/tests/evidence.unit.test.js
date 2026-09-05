const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const {
  formatEvidence,
  createEvidence,
  listEvidenceForChargeback,
  getEvidenceById,
  updateEvidence,
  deleteEvidence,
  buildEvidenceIndex,
} = require('../src/services/evidenceService');
const { Evidence, Chargeback, Transaction, AuditLog } = require('../src/models');
const {
  createEvidenceSchema,
  updateEvidenceSchema,
} = require('../src/validators/evidenceValidators');
const AppError = require('../src/utils/AppError');

describe('PHASE 2N — EVIDENCE VAULT & INTELLIGENCE (UNIT TESTS)', () => {
  const MERCHANT_ID = '507f1f77bcf86cd799439011';
  const CB_ID = '507f1f77bcf86cd799439022';
  const TX_ID = '507f1f77bcf86cd799439033';
  const EV_ID = '507f1f77bcf86cd799439044';

  // =========================================================================
  // 1. VALIDATION & SECURITY INVARIANTS
  // =========================================================================
  describe('1. Validation & Security Invariants', () => {
    it('rejects path traversal in filename', () => {
      assert.throws(() => {
        createEvidenceSchema.body.parse({
          type: 'ORDER',
          title: 'Proof Receipt',
          fileMetadata: {
            filename: '../../etc/passwd',
          },
        });
      });
    });

    it('rejects path traversal in storageKey', () => {
      assert.throws(() => {
        createEvidenceSchema.body.parse({
          type: 'DELIVERY',
          title: 'Carrier Confirmation',
          fileMetadata: {
            storageKey: 'uploads/../../secret_key',
          },
        });
      });
    });

    it('rejects file size exceeding 50MB (52,428,800 bytes)', () => {
      assert.throws(() => {
        createEvidenceSchema.body.parse({
          type: 'ORDER',
          title: 'Large file',
          fileMetadata: {
            sizeBytes: 60 * 1024 * 1024,
          },
        });
      });
    });

    it('rejects negative file size', () => {
      assert.throws(() => {
        createEvidenceSchema.body.parse({
          type: 'ORDER',
          title: 'Negative file',
          fileMetadata: {
            sizeBytes: -1,
          },
        });
      });
    });

    it('rejects prohibited credentials and cardholder PAN in fact keys', () => {
      const prohibitedKeys = ['cvv', 'cvc', 'pan', 'password', 'token', 'jwt', 'apiKey', 'secret'];
      for (const key of prohibitedKeys) {
        assert.throws(() => {
          createEvidenceSchema.body.parse({
            type: 'CUSTOMER',
            title: 'Customer Data',
            extractedFacts: [{ key, value: 'prohibited-content' }],
          });
        });
      }
    });

    it('rejects prohibited credentials in fact string values', () => {
      assert.throws(() => {
        createEvidenceSchema.body.parse({
          type: 'CUSTOMER',
          title: 'Customer Auth',
          extractedFacts: [{ key: 'auth_details', value: 'my secret password123' }],
        });
      });
    });

    it('accepts safe observable extracted facts', () => {
      const parsed = createEvidenceSchema.body.parse({
        type: 'DELIVERY',
        title: 'FedEx Delivery Proof',
        source: 'CARRIER',
        fileMetadata: {
          filename: 'delivery_proof_9921.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1048576,
          storageKey: 'evidence/proof_9921.pdf',
        },
        extractedFacts: [
          { key: 'deliveryStatus', value: 'DELIVERED', confidence: 1.0, verified: true },
          { key: 'trackingNumberMasked', value: '1Z999***01', confidence: 1.0, verified: true },
          { key: 'deliveredAt', value: '2026-09-02T14:30:00.000Z' },
        ],
      });

      assert.equal(parsed.title, 'FedEx Delivery Proof');
      assert.equal(parsed.extractedFacts.length, 3);
      assert.equal(parsed.extractedFacts[0].key, 'deliveryStatus');
    });
  });

  // =========================================================================
  // 2. RESPONSE SANITIZATION & FORMATTER
  // =========================================================================
  describe('2. formatEvidence Sanitization', () => {
    it('formats evidence document and excludes sensitive data and internals', () => {
      const mockDoc = {
        _id: new mongoose.Types.ObjectId(EV_ID),
        merchantId: new mongoose.Types.ObjectId(MERCHANT_ID),
        chargebackId: new mongoose.Types.ObjectId(CB_ID),
        transactionId: new mongoose.Types.ObjectId(TX_ID),
        type: 'ORDER',
        title: 'Customer Receipt',
        description: 'Store invoice generated at checkout',
        source: 'MERCHANT_SYSTEM',
        fileMetadata: {
          filename: 'invoice_102.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 24500,
          storageKey: 'vault/invoice_102.pdf',
        },
        extractedFacts: [{ key: 'orderId', value: 'ORD-9921', confidence: 1.0, verified: true }],
        collectedAt: new Date('2026-09-01T00:00:00.000Z'),
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
        updatedAt: new Date('2026-09-01T00:00:00.000Z'),
        // Sensitive fields that must NOT appear
        password: 'leak_secret_value',
        pan: '4111111111111111',
        cvv: '999',
        __v: 0,
      };

      const formatted = formatEvidence(mockDoc);

      assert.equal(formatted.id, EV_ID);
      assert.equal(formatted.merchantId, MERCHANT_ID);
      assert.equal(formatted.chargebackId, CB_ID);
      assert.equal(formatted.transactionId, TX_ID);
      assert.equal(formatted.type, 'ORDER');
      assert.equal(formatted.title, 'Customer Receipt');
      assert.equal(formatted.source, 'MERCHANT_SYSTEM');
      assert.equal(formatted.fileMetadata.filename, 'invoice_102.pdf');
      assert.equal(formatted.extractedFacts[0].key, 'orderId');
      assert.equal(formatted.extractedFacts[0].value, 'ORD-9921');

      // Ensure no credentials leak
      assert.equal(formatted.password, undefined);
      assert.equal(formatted.pan, undefined);
      assert.equal(formatted.cvv, undefined);
      assert.equal(formatted.__v, undefined);
    });
  });

  // =========================================================================
  // 3. SERVICE METHODS (CREATE, GET, LIST, UPDATE, DELETE)
  // =========================================================================
  describe('3. Service Methods', () => {
    let origCbFindOne;
    let origTxFindOne;
    let origEvFindOne;
    let origEvCreate;
    let origEvFind;
    let origEvCount;
    let origEvFindOneAndDelete;
    let origCbUpdateOne;

    beforeEach(() => {
      origCbFindOne = Chargeback.findOne;
      origTxFindOne = Transaction.findOne;
      origEvFindOne = Evidence.findOne;
      origEvCreate = Evidence.create;
      origEvFind = Evidence.find;
      origEvCount = Evidence.countDocuments;
      origEvFindOneAndDelete = Evidence.findOneAndDelete;
      origCbUpdateOne = Chargeback.updateOne;
    });

    afterEach(() => {
      Chargeback.findOne = origCbFindOne;
      Transaction.findOne = origTxFindOne;
      Evidence.findOne = origEvFindOne;
      Evidence.create = origEvCreate;
      Evidence.find = origEvFind;
      Evidence.countDocuments = origEvCount;
      Evidence.findOneAndDelete = origEvFindOneAndDelete;
      Chargeback.updateOne = origCbUpdateOne;
    });

    it('createEvidence rejects if chargeback does not belong to merchant (404)', async () => {
      Chargeback.findOne = async () => null;

      await assert.rejects(
        () =>
          createEvidence(MERCHANT_ID, CB_ID, {
            type: 'ORDER',
            title: 'Order Proof',
          }),
        (err) => err instanceof AppError && err.code === 'CHARGEBACK_NOT_FOUND' && err.statusCode === 404
      );
    });

    it('createEvidence rejects if chargeback is in CLOSED status (400)', async () => {
      Chargeback.findOne = async () => ({
        _id: new mongoose.Types.ObjectId(CB_ID),
        merchantId: new mongoose.Types.ObjectId(MERCHANT_ID),
        transactionId: new mongoose.Types.ObjectId(TX_ID),
        status: 'CLOSED',
      });

      await assert.rejects(
        () =>
          createEvidence(MERCHANT_ID, CB_ID, {
            type: 'ORDER',
            title: 'Late Evidence',
          }),
        (err) => err instanceof AppError && err.code === 'INVALID_EVIDENCE_OPERATION' && err.statusCode === 400
      );
    });

    it('createEvidence rejects if transactionId does not match chargeback (400)', async () => {
      Chargeback.findOne = async () => ({
        _id: new mongoose.Types.ObjectId(CB_ID),
        merchantId: new mongoose.Types.ObjectId(MERCHANT_ID),
        transactionId: new mongoose.Types.ObjectId(TX_ID),
        status: 'OPEN',
      });

      await assert.rejects(
        () =>
          createEvidence(MERCHANT_ID, CB_ID, {
            transactionId: '507f1f77bcf86cd799439999', // Mismatched
            type: 'ORDER',
            title: 'Order Proof',
          }),
        (err) => err instanceof AppError && err.code === 'VALIDATION_ERROR' && err.statusCode === 400
      );
    });

    it('createEvidence successfully creates evidence and inherits chargeback transactionId', async () => {
      Chargeback.findOne = async () => ({
        _id: new mongoose.Types.ObjectId(CB_ID),
        merchantId: new mongoose.Types.ObjectId(MERCHANT_ID),
        transactionId: new mongoose.Types.ObjectId(TX_ID),
        status: 'OPEN',
      });

      let persisted;
      Evidence.create = async (payload) => {
        persisted = payload;
        return {
          ...payload,
          _id: new mongoose.Types.ObjectId(EV_ID),
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      };
      Chargeback.updateOne = async () => {};

      const result = await createEvidence(MERCHANT_ID, CB_ID, {
        merchantId: 'ATTACKER_ID', // Must be ignored
        type: 'ORDER',
        title: 'Valid Proof',
      });

      assert.equal(persisted.merchantId, MERCHANT_ID);
      assert.equal(persisted.transactionId.toString(), TX_ID);
      assert.equal(result.title, 'Valid Proof');
      assert.equal(result.merchantId, MERCHANT_ID);
    });

    it('deleteEvidence rejects when chargeback is in SUBMITTED state (400)', async () => {
      Chargeback.findOne = async () => ({
        _id: new mongoose.Types.ObjectId(CB_ID),
        merchantId: new mongoose.Types.ObjectId(MERCHANT_ID),
        status: 'SUBMITTED',
      });

      await assert.rejects(
        () => deleteEvidence(MERCHANT_ID, CB_ID, EV_ID),
        (err) => err instanceof AppError && err.code === 'INVALID_EVIDENCE_OPERATION' && err.statusCode === 400
      );
    });
  });

  // =========================================================================
  // 4. DETERMINISTIC EVIDENCE INDEX & CONSISTENCY CHECKS
  // =========================================================================
  describe('4. buildEvidenceIndex & Consistency Warnings', () => {
    let origCbFindOne;
    let origTxFindOne;
    let origEvFind;

    beforeEach(() => {
      origCbFindOne = Chargeback.findOne;
      origTxFindOne = Transaction.findOne;
      origEvFind = Evidence.find;
    });

    afterEach(() => {
      Chargeback.findOne = origCbFindOne;
      Transaction.findOne = origTxFindOne;
      Evidence.find = origEvFind;
    });

    it('builds a deterministic index with sorted facts and coverage booleans', async () => {
      Chargeback.findOne = async () => ({
        _id: new mongoose.Types.ObjectId(CB_ID),
        merchantId: new mongoose.Types.ObjectId(MERCHANT_ID),
        transactionId: new mongoose.Types.ObjectId(TX_ID),
        caseNumber: 'CASE-INDEX-1',
        disputeAmount: 150.0,
        save: async () => {},
      });

      Transaction.findOne = () => ({
        lean: async () => ({
          _id: new mongoose.Types.ObjectId(TX_ID),
          amount: 150.0,
        }),
      });

      const mockEvidence = [
        {
          _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439001'),
          type: 'SHIPPING',
          title: 'Tracking Slip',
          transactionId: new mongoose.Types.ObjectId(TX_ID),
          extractedFacts: [
            { key: 'carrier', value: 'UPS', confidence: 1.0, verified: true },
            { key: 'trackingNumber', value: '1Z999', confidence: 1.0, verified: true },
          ],
        },
        {
          _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439002'),
          type: 'ORDER',
          title: 'Store Receipt',
          transactionId: new mongoose.Types.ObjectId(TX_ID),
          extractedFacts: [
            { key: 'orderAmount', value: 150.0, confidence: 1.0, verified: true },
            { key: 'orderId', value: 'ORD-100', confidence: 1.0, verified: true },
          ],
        },
        {
          _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439003'),
          type: 'DELIVERY',
          title: 'Delivery Confirmation',
          transactionId: new mongoose.Types.ObjectId(TX_ID),
          extractedFacts: [
            { key: 'deliveryStatus', value: 'DELIVERED', confidence: 1.0, verified: true },
          ],
        },
      ];

      Evidence.find = () => ({
        sort: () => ({
          lean: async () => mockEvidence,
        }),
      });

      const index = await buildEvidenceIndex(MERCHANT_ID, CB_ID);

      assert.equal(index.chargebackId, CB_ID);
      assert.equal(index.transactionId, TX_ID);
      assert.equal(index.evidenceCount, 3);
      assert.equal(index.categories.ORDER, 1);
      assert.equal(index.categories.SHIPPING, 1);
      assert.equal(index.categories.DELIVERY, 1);
      assert.equal(index.coverage.order, true);
      assert.equal(index.coverage.shipping, true);
      assert.equal(index.coverage.delivery, true);
      assert.equal(index.coverage.refund, false);

      // Facts must be sorted deterministically: DELIVERY comes before ORDER then SHIPPING
      assert.equal(index.facts[0].category, 'DELIVERY');
      assert.equal(index.facts[1].category, 'ORDER');
      assert.equal(index.facts[1].fact, 'orderAmount');
      assert.equal(index.facts[2].fact, 'orderId');
      assert.equal(index.facts[3].category, 'SHIPPING');
      assert.equal(index.warnings.length, 0);
    });

    it('generates ORDER_AMOUNT_MISMATCH warning when extracted order amount differs', async () => {
      Chargeback.findOne = async () => ({
        _id: new mongoose.Types.ObjectId(CB_ID),
        merchantId: new mongoose.Types.ObjectId(MERCHANT_ID),
        transactionId: new mongoose.Types.ObjectId(TX_ID),
        caseNumber: 'CASE-WARN-1',
        disputeAmount: 150.0,
        save: async () => {},
      });

      Transaction.findOne = () => ({
        lean: async () => ({
          _id: new mongoose.Types.ObjectId(TX_ID),
          amount: 150.0, // Transaction amount
        }),
      });

      Evidence.find = () => ({
        sort: () => ({
          lean: async () => [
            {
              _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439001'),
              type: 'ORDER',
              title: 'Mismatch Receipt',
              transactionId: new mongoose.Types.ObjectId(TX_ID),
              extractedFacts: [
                { key: 'orderAmount', value: 99.0, confidence: 1.0 }, // 99 vs 150!
              ],
            },
          ],
        }),
      });

      const index = await buildEvidenceIndex(MERCHANT_ID, CB_ID);
      assert.equal(index.warnings.length, 1);
      assert.equal(index.warnings[0].code, 'ORDER_AMOUNT_MISMATCH');
      assert.equal(index.warnings[0].severity, 'WARNING');
    });

    it('generates REFUND_EXCEEDS_DISPUTE warning when refund exceeds transaction total', async () => {
      Chargeback.findOne = async () => ({
        _id: new mongoose.Types.ObjectId(CB_ID),
        merchantId: new mongoose.Types.ObjectId(MERCHANT_ID),
        transactionId: new mongoose.Types.ObjectId(TX_ID),
        caseNumber: 'CASE-WARN-2',
        disputeAmount: 100.0,
        save: async () => {},
      });

      Transaction.findOne = () => ({
        lean: async () => ({
          _id: new mongoose.Types.ObjectId(TX_ID),
          amount: 100.0,
        }),
      });

      Evidence.find = () => ({
        sort: () => ({
          lean: async () => [
            {
              _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439001'),
              type: 'REFUND',
              title: 'Refund Notice',
              transactionId: new mongoose.Types.ObjectId(TX_ID),
              extractedFacts: [
                { key: 'refundAmount', value: 200.0, confidence: 1.0 }, // 200 vs 100!
              ],
            },
          ],
        }),
      });

      const index = await buildEvidenceIndex(MERCHANT_ID, CB_ID);
      assert.equal(index.warnings.length, 1);
      assert.equal(index.warnings[0].code, 'REFUND_EXCEEDS_DISPUTE');
    });
  });
});
