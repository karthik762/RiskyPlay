/**
 * Unit tests for Phase 2O — Automated Defensive Response & Decision System.
 * Tests AI client, ChargebackResponseAgent, ChargebackResponseVerificationAgent, and chargebackDecisionService.
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  sanitizeChargebackPayload,
  generateChargebackResponse,
} = require('../src/services/aiChargebackResponseService');
const ChargebackResponseAgent = require('../src/agents/chargeback/ChargebackResponseAgent');
const ChargebackResponseVerificationAgent = require('../src/agents/chargeback/ChargebackResponseVerificationAgent');
const chargebackDecisionService = require('../src/services/chargebackDecisionService');
const { AgentContext } = require('../src/agents');

describe('PHASE 2O — DEFENSIVE RESPONSE & DECISION SYSTEM (UNIT)', () => {
  describe('1. aiChargebackResponseService', () => {
    it('properly sanitizes chargeback, transaction, and evidence payloads without sensitive data', () => {
      const chargeback = {
        _id: '507f1f77bcf86cd799439011',
        disputeAmount: 250.50,
        currency: 'USD',
        reasonCode: '10.4',
        reasonCategory: 'FRAUD',
        stage: 'FIRST_CHARGEBACK',
        network: 'VISA',
      };

      const transaction = {
        _id: '507f1f77bcf86cd799439012',
        amount: 250.50,
        currency: 'USD',
        customer: {
          email: 'shopper@example.com',
          passwordHash: 'secret_hash_value',
        },
        paymentMethod: {
          cardBin: '411111',
          cardLast4: '1111',
          cvv: '123',
        },
      };

      const evidenceIndex = {
        completenessScore: 80,
        missingCriticalTypes: [],
        items: [
          {
            _id: '507f1f77bcf86cd799439013',
            evidenceType: 'PROOF_OF_DELIVERY',
            title: 'Carrier Receipt',
            extractedFacts: { trackingNumber: 'TRK12345' },
          },
        ],
      };

      const sanitized = sanitizeChargebackPayload({ chargeback, transaction, evidenceIndex });

      assert.equal(sanitized.chargeback.id, '507f1f77bcf86cd799439011');
      assert.equal(sanitized.chargeback.disputeAmount, 250.5);
      assert.equal(sanitized.evidenceItems.length, 1);
      assert.equal(sanitized.evidenceItems[0].id, '507f1f77bcf86cd799439013');

      // Transaction PII checks
      assert.equal(sanitized.transaction.customer.email, 's***r@example.com');
      assert.equal(sanitized.transaction.customer.passwordHash, undefined);
      assert.equal(sanitized.transaction.paymentMethod.cvv, undefined);
      assert.equal(sanitized.transaction.paymentMethod.cardLast4, '1111');
    });

    it('gracefully handles network or timeout errors without throwing', async () => {
      const result = await generateChargebackResponse({
        chargeback: { id: 'cb1', disputeAmount: 100 },
        transaction: { id: 'tx1', amount: 100 },
        evidenceIndex: { items: [] },
        options: { serviceUrl: 'http://127.0.0.1:54321', timeoutMs: 50 },
      });

      assert.equal(result.success, false);
      assert.equal(result.status, 'UNAVAILABLE');
      assert.ok(result.error);
    });
  });

  describe('2. ChargebackResponseAgent', () => {
    it('requires chargeback in AgentContext', async () => {
      const agent = new ChargebackResponseAgent();
      const context = new AgentContext({
        runId: 'run-1',
        merchantId: 'm-1',
        transactionId: 't-1',
        transaction: { amount: 50 },
      });

      await assert.rejects(
        async () => agent.execute(context),
        { code: 'MISSING_CONTEXT' }
      );
    });

    it('records operational reasoning without chain-of-thought scratchpad', async () => {
      const agent = new ChargebackResponseAgent();
      const context = new AgentContext({
        runId: 'run-1',
        merchantId: 'm-1',
        transactionId: 't-1',
        chargebackId: 'cb-1',
        chargeback: { disputeAmount: 150, currency: 'USD', reasonCode: '10.4' },
        transaction: { amount: 150 },
        evidenceIndex: { items: [{ id: 'ev-1' }] },
      });

      const res = await agent.execute(context);
      assert.equal(res.agentName, 'CHARGEBACK_RESPONSE');
      assert.ok(res.reasoning);
      assert.ok(Array.isArray(res.reasoning.evidenceConsidered));
      assert.ok(Array.isArray(res.reasoning.validationPerformed));
      assert.ok(res.reasoning.decisionProduced);
    });
  });

  describe('3. ChargebackResponseVerificationAgent', () => {
    const chargeback = { disputeAmount: 100, currency: 'USD' };
    const transaction = { amount: 100, currency: 'USD' };
    const evidenceIndex = {
      items: [
        {
          _id: 'ev-pod-1',
          evidenceType: 'PROOF_OF_DELIVERY',
          extractedFacts: { trackingNumber: 'TRK999', deliveryDate: '2026-08-15' },
        },
      ],
    };

    it('verifies valid evidence grounding and clean response text', async () => {
      const verifier = new ChargebackResponseVerificationAgent();
      const context = new AgentContext({
        runId: 'run-1',
        merchantId: 'm-1',
        transactionId: 't-1',
        chargebackId: 'cb-1',
        chargeback,
        transaction,
        evidenceIndex,
        previousAgentResults: {
          CHARGEBACK_RESPONSE: {
            status: 'SUCCESS',
            responseText: 'The transaction for $100.00 was fulfilled and delivered per carrier records.',
            keyArguments: [
              {
                claim: 'Merchandise was delivered with tracking TRK999',
                evidenceItemIds: ['ev-pod-1'],
              },
            ],
            summary: 'Merchandise delivered with tracking',
          },
        },
      });

      const result = await verifier.execute(context);
      assert.equal(result.output.status, 'VERIFIED');
      assert.equal(result.output.warnings.length, 0);
      assert.equal(result.output.unsupportedClaims.length, 0);
      assert.equal(result.output.argumentGrounding[0].status, 'GROUNDED');
    });

    it('rejects response text containing prohibited customer fraud accusations', async () => {
      const verifier = new ChargebackResponseVerificationAgent();
      const context = new AgentContext({
        runId: 'run-1',
        merchantId: 'm-1',
        transactionId: 't-1',
        chargebackId: 'cb-1',
        chargeback,
        transaction,
        evidenceIndex,
        previousAgentResults: {
          CHARGEBACK_RESPONSE: {
            status: 'SUCCESS',
            responseText: 'The cardholder is lying and this is a fraudulent customer who stole the card.',
            keyArguments: [
              { claim: 'Delivery completed', evidenceItemIds: ['ev-pod-1'] },
            ],
            summary: 'Customer fraud detected',
          },
        },
      });

      const result = await verifier.execute(context);
      assert.equal(result.output.status, 'REJECTED');
      const fraudClaim = result.output.unsupportedClaims.find(
        (c) => c.claimType === 'UNSUPPORTED_FRAUD_CLAIM'
      );
      assert.ok(fraudClaim);
    });

    it('rejects response text asserting guaranteed win or submission complete', async () => {
      const verifier = new ChargebackResponseVerificationAgent();
      const context = new AgentContext({
        runId: 'run-1',
        merchantId: 'm-1',
        transactionId: 't-1',
        chargebackId: 'cb-1',
        chargeback,
        transaction,
        evidenceIndex,
        previousAgentResults: {
          CHARGEBACK_RESPONSE: {
            status: 'SUCCESS',
            responseText: 'We will win this dispute because the evidence is indisputable. Submission complete.',
            keyArguments: [
              { claim: 'Delivery completed', evidenceItemIds: ['ev-pod-1'] },
            ],
            summary: 'Guaranteed victory',
          },
        },
      });

      const result = await verifier.execute(context);
      assert.equal(result.output.status, 'REJECTED');
      const outcomeClaim = result.output.unsupportedClaims.find(
        (c) => c.claimType === 'UNSUPPORTED_OUTCOME_CLAIM'
      );
      assert.ok(outcomeClaim);
    });

    it('flags ungrounded/nonexistent evidence IDs as REJECTED', async () => {
      const verifier = new ChargebackResponseVerificationAgent();
      const context = new AgentContext({
        runId: 'run-1',
        merchantId: 'm-1',
        transactionId: 't-1',
        chargebackId: 'cb-1',
        chargeback,
        transaction,
        evidenceIndex,
        previousAgentResults: {
          CHARGEBACK_RESPONSE: {
            status: 'SUCCESS',
            responseText: 'Goods were received in full for $100.00.',
            keyArguments: [
              { claim: 'Cardholder signed receipt', evidenceItemIds: ['nonexistent-evidence-id'] },
            ],
            summary: 'Signed delivery',
          },
        },
      });

      const result = await verifier.execute(context);
      assert.equal(result.output.status, 'REJECTED');
      assert.ok(result.output.unsupportedClaims.some((c) => c.claimType === 'MISSING_EVIDENCE_ID'));
    });

    it('flags unsupported dollar amounts with warnings', async () => {
      const verifier = new ChargebackResponseVerificationAgent();
      const context = new AgentContext({
        runId: 'run-1',
        merchantId: 'm-1',
        transactionId: 't-1',
        chargebackId: 'cb-1',
        chargeback,
        transaction,
        evidenceIndex,
        previousAgentResults: {
          CHARGEBACK_RESPONSE: {
            status: 'SUCCESS',
            responseText: 'The customer was billed $999.00 for this order, not the claimed amount.',
            keyArguments: [
              { claim: 'Delivery completed', evidenceItemIds: ['ev-pod-1'] },
            ],
            summary: 'Order details',
          },
        },
      });

      const result = await verifier.execute(context);
      assert.equal(result.output.status, 'VERIFIED_WITH_WARNINGS');
      assert.ok(result.output.unsupportedClaims.some((c) => c.claimType === 'UNSUPPORTED_AMOUNT'));
    });
  });

  describe('4. chargebackDecisionService', () => {
    it('recommends DEFEND with high confidence for high completeness and clean verification', () => {
      const decision = chargebackDecisionService.evaluateChargebackDecision({
        evidenceIndex: { completenessScore: 85, missingCriticalTypes: [] },
        verification: { status: 'VERIFIED', warnings: [], unsupportedClaims: [] },
      });

      assert.equal(decision.recommendation, 'DEFEND');
      assert.equal(decision.authority, 'DETERMINISTIC_POLICY');
      assert.ok(decision.confidence >= 0.8);
    });

    it('recommends DEFEND_WITH_REVIEW when warnings exist or completeness is moderate', () => {
      const decision = chargebackDecisionService.evaluateChargebackDecision({
        evidenceIndex: { completenessScore: 65, missingCriticalTypes: [] },
        verification: { status: 'VERIFIED_WITH_WARNINGS', warnings: ['Unverified amount $50.00'] },
      });

      assert.equal(decision.recommendation, 'DEFEND_WITH_REVIEW');
    });

    it('recommends INSUFFICIENT_EVIDENCE when completeness is below 40 or multiple critical types missing', () => {
      const decision = chargebackDecisionService.evaluateChargebackDecision({
        evidenceIndex: { completenessScore: 25, missingCriticalTypes: ['PROOF_OF_DELIVERY', 'CUSTOMER_COMMUNICATION'] },
        verification: { status: 'VERIFIED' },
      });

      assert.equal(decision.recommendation, 'INSUFFICIENT_EVIDENCE');
    });

    it('recommends DO_NOT_RECOMMEND_DEFENSE when verification is REJECTED', () => {
      const decision = chargebackDecisionService.evaluateChargebackDecision({
        evidenceIndex: { completenessScore: 90, missingCriticalTypes: [] },
        verification: {
          status: 'REJECTED',
          unsupportedClaims: [{ claimType: 'UNSUPPORTED_FRAUD_CLAIM' }],
        },
      });

      assert.equal(decision.recommendation, 'DO_NOT_RECOMMEND_DEFENSE');
    });
  });
});
