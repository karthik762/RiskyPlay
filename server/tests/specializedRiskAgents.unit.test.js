/**
 * Unit & Contract Tests for Specialized Risk & Verification Agents (Phase 2L).
 * Verifies RiskAnalystAgent, RiskVerificationAgent, contract enforcement,
 * evidence grounding, unsupported claim detection, and deterministic authority.
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  AgentContext,
  AgentResult,
  AgentError,
  TransactionRiskBaselineAgent,
  RiskAnalystAgent,
  RiskVerificationAgent,
  Orchestrator,
  AgentRegistry,
  TRANSACTION_RISK_WORKFLOW,
} = require('../src/agents');
const aiRiskService = require('../src/services/aiRiskService');

describe('PHASE 2L — SPECIALIZED RISK & VERIFICATION AGENTS', () => {
  let originalAnalyzeRisk;

  beforeEach(() => {
    originalAnalyzeRisk = aiRiskService.analyzeTransactionRisk;
  });

  afterEach(() => {
    aiRiskService.analyzeTransactionRisk = originalAnalyzeRisk;
  });

  // =========================================================================
  // 1. RISK ANALYST AGENT TESTS
  // =========================================================================
  describe('1. RiskAnalystAgent Contract & Execution', () => {
    it('Requires TRANSACTION_RISK_BASELINE predecessor result', async () => {
      const agent = new RiskAnalystAgent();
      const contextWithoutBaseline = new AgentContext({
        runId: 'r1',
        merchantId: 'm1',
        transactionId: 't1',
        transaction: { amount: 100, currency: 'USD' },
      });

      await assert.rejects(
        () => agent.execute(contextWithoutBaseline),
        (err) => err instanceof AgentError && err.code === 'MISSING_PREDECESSOR_RESULT'
      );
    });

    it('Executes successfully with conformant AI response and outputs advisory metrics', async () => {
      aiRiskService.analyzeTransactionRisk = async () => ({
        success: true,
        status: 'SUCCESS',
        aiScore: 75,
        riskTier: 'HIGH',
        recommendation: 'DECLINE',
        summary: 'Elevated transaction amount and cart mismatch detected.',
        riskFactors: [
          { code: 'HIGH_AMOUNT', description: 'Transaction amount is elevated', severity: 'HIGH' },
        ],
      });

      const agent = new RiskAnalystAgent();
      const baselineResult = AgentResult.success({
        agentName: 'TRANSACTION_RISK_BASELINE',
        agentVersion: '1.0.0',
        output: {
          riskScore: 75,
          riskTier: 'HIGH',
          recommendation: 'DECLINE',
          matchedRules: ['HIGH_VALUE_TRANSACTION'],
          signals: [],
        },
      });

      const context = new AgentContext({
        runId: 'r1',
        merchantId: 'm1',
        transactionId: 't1',
        transaction: { amount: 1500, currency: 'USD' },
      }).withAgentResult(baselineResult);

      const result = await agent.execute(context);

      assert.equal(result.success, true);
      assert.equal(result.agentName, 'RISK_ANALYST');
      assert.equal(result.output.status, 'SUCCESS');
      assert.equal(result.output.aiScore, 75);
      assert.equal(result.output.aiTier, 'HIGH');
      assert.equal(result.output.aiRecommendation, 'DECLINE');
      assert.equal(result.output.baselineScore, 75);
      assert.equal(result.output.riskFactors.length, 1);
      assert.ok(result.reasoning.decisionProduced.includes('AI advisory score 75'));
    });

    it('Gracefully degrades without crashing when AI service is unavailable', async () => {
      aiRiskService.analyzeTransactionRisk = async () => ({
        success: false,
        status: 'UNAVAILABLE',
        error: 'ECONNREFUSED: AI service unreachable at port 8000',
      });

      const agent = new RiskAnalystAgent();
      const baselineResult = AgentResult.success({
        agentName: 'TRANSACTION_RISK_BASELINE',
        agentVersion: '1.0.0',
        output: {
          riskScore: 40,
          riskTier: 'MEDIUM',
          recommendation: 'REVIEW',
        },
      });

      const context = new AgentContext({
        runId: 'r1',
        merchantId: 'm1',
        transactionId: 't1',
        transaction: { amount: 600, currency: 'USD' },
      }).withAgentResult(baselineResult);

      const result = await agent.execute(context);

      assert.equal(result.success, true);
      assert.equal(result.output.status, 'UNAVAILABLE');
      assert.equal(result.output.aiScore, null, 'aiScore must remain null when unavailable');
      assert.equal(result.output.aiTier, null);
      assert.equal(result.output.baselineScore, 40);
      assert.ok(result.output.error.includes('ECONNREFUSED'));
      assert.ok(result.reasoning.decisionProduced.includes('AI advisory unavailable'));
    });

    it('Handles AI service timeout gracefully without crashing', async () => {
      aiRiskService.analyzeTransactionRisk = async () => ({
        success: false,
        status: 'UNAVAILABLE',
        error: 'AI service request timed out after 4000ms',
      });

      const agent = new RiskAnalystAgent();
      const baselineResult = AgentResult.success({
        agentName: 'TRANSACTION_RISK_BASELINE',
        agentVersion: '1.0.0',
        output: { riskScore: 10, riskTier: 'LOW', recommendation: 'APPROVE' },
      });

      const context = new AgentContext({
        runId: 'r1',
        merchantId: 'm1',
        transactionId: 't1',
        transaction: { amount: 20 },
      }).withAgentResult(baselineResult);

      const result = await agent.execute(context);

      assert.equal(result.success, true);
      assert.equal(result.output.status, 'UNAVAILABLE');
      assert.equal(result.output.aiScore, null);
      assert.match(result.output.error, /timed out/);
    });

    it('Handles malformed AI response gracefully with FAILED status', async () => {
      aiRiskService.analyzeTransactionRisk = async () => ({
        success: false,
        status: 'FAILED',
        error: 'AI service response failed contract validation',
      });

      const agent = new RiskAnalystAgent();
      const baselineResult = AgentResult.success({
        agentName: 'TRANSACTION_RISK_BASELINE',
        agentVersion: '1.0.0',
        output: { riskScore: 20, riskTier: 'LOW', recommendation: 'APPROVE' },
      });

      const context = new AgentContext({
        runId: 'r1',
        merchantId: 'm1',
        transactionId: 't1',
        transaction: { amount: 50 },
      }).withAgentResult(baselineResult);

      const result = await agent.execute(context);

      assert.equal(result.success, true);
      assert.equal(result.output.status, 'FAILED');
      assert.equal(result.output.aiScore, null);
      assert.equal(result.output.baselineScore, 20);
    });
  });

  // =========================================================================
  // 2. RISK VERIFICATION AGENT TESTS
  // =========================================================================
  describe('2. RiskVerificationAgent Contract & Deterministic Checks', () => {
    it('Requires both TRANSACTION_RISK_BASELINE and RISK_ANALYST predecessor results', async () => {
      const verifier = new RiskVerificationAgent();

      // Case A: Missing baseline
      const contextWithoutBaseline = new AgentContext({
        runId: 'r1',
        merchantId: 'm1',
        transactionId: 't1',
        transaction: { amount: 100 },
      });
      await assert.rejects(
        () => verifier.execute(contextWithoutBaseline),
        (err) => err instanceof AgentError && err.code === 'MISSING_PREDECESSOR_RESULT'
      );

      // Case B: Has baseline but missing analyst
      const contextWithOnlyBaseline = contextWithoutBaseline.withAgentResult(
        AgentResult.success({
          agentName: 'TRANSACTION_RISK_BASELINE',
          agentVersion: '1.0.0',
          output: { riskScore: 20, riskTier: 'LOW', recommendation: 'APPROVE' },
        })
      );
      await assert.rejects(
        () => verifier.execute(contextWithOnlyBaseline),
        (err) => err instanceof AgentError && err.code === 'MISSING_PREDECESSOR_RESULT'
      );
    });

    it('Verifies clean matching AI and baseline result as VERIFIED', async () => {
      const verifier = new RiskVerificationAgent();

      const baselineResult = AgentResult.success({
        agentName: 'TRANSACTION_RISK_BASELINE',
        agentVersion: '1.0.0',
        output: { riskScore: 75, riskTier: 'HIGH', recommendation: 'DECLINE' },
      });

      const analystResult = AgentResult.success({
        agentName: 'RISK_ANALYST',
        agentVersion: '1.0.0',
        output: {
          status: 'SUCCESS',
          aiScore: 80,
          aiTier: 'HIGH',
          aiRecommendation: 'DECLINE',
          riskFactors: [
            { code: 'HIGH_AMOUNT', description: 'Transaction amount 1500 exceeds threshold', severity: 'HIGH' },
          ],
          baselineScore: 75,
        },
      });

      const context = new AgentContext({
        runId: 'r1',
        merchantId: 'm1',
        transactionId: 't1',
        transaction: { amount: 1500, currency: 'USD' },
      })
        .withAgentResult(baselineResult)
        .withAgentResult(analystResult);

      const result = await verifier.execute(context);

      assert.equal(result.success, true);
      assert.equal(result.output.status, 'VERIFIED');
      assert.equal(result.output.baselineAuthority.verified, true);
      assert.equal(result.output.comparison.baselineScore, 75);
      assert.equal(result.output.comparison.aiScore, 80);
      assert.equal(result.output.comparison.scoreDelta, 5);
      assert.equal(result.output.comparison.tierAgreement, true);
      assert.equal(result.output.comparison.recommendationAgreement, true);
      assert.equal(result.output.factorAnalysis[0].groundingStatus, 'GROUNDED');
      assert.equal(result.output.warnings.length, 0);
    });

    it('Sets status to AI_UNAVAILABLE when AI service degraded gracefully', async () => {
      const verifier = new RiskVerificationAgent();

      const baselineResult = AgentResult.success({
        agentName: 'TRANSACTION_RISK_BASELINE',
        agentVersion: '1.0.0',
        output: { riskScore: 40, riskTier: 'MEDIUM', recommendation: 'REVIEW' },
      });

      const analystResult = AgentResult.success({
        agentName: 'RISK_ANALYST',
        agentVersion: '1.0.0',
        output: {
          status: 'UNAVAILABLE',
          aiScore: null,
          aiTier: null,
          aiRecommendation: null,
          riskFactors: [],
          baselineScore: 40,
        },
      });

      const context = new AgentContext({
        runId: 'r1',
        merchantId: 'm1',
        transactionId: 't1',
        transaction: { amount: 500 },
      })
        .withAgentResult(baselineResult)
        .withAgentResult(analystResult);

      const result = await verifier.execute(context);

      assert.equal(result.success, true);
      assert.equal(result.output.status, 'AI_UNAVAILABLE');
      assert.equal(result.output.baselineAuthority.verified, true);
      assert.equal(result.output.comparison.aiScore, null);
      assert.equal(result.output.comparison.scoreDelta, null);
      assert.ok(result.output.warnings[0].includes('AI advisory service was unavailable'));
    });

    it('Rejects AI response that violates score/tier threshold consistency', async () => {
      const verifier = new RiskVerificationAgent();

      const baselineResult = AgentResult.success({
        agentName: 'TRANSACTION_RISK_BASELINE',
        agentVersion: '1.0.0',
        output: { riskScore: 20, riskTier: 'LOW', recommendation: 'APPROVE' },
      });

      // Contradictory AI output: Score 85 (HIGH) but claimed tier LOW and APPROVE
      const analystResult = AgentResult.success({
        agentName: 'RISK_ANALYST',
        agentVersion: '1.0.0',
        output: {
          status: 'SUCCESS',
          aiScore: 85,
          aiTier: 'LOW',
          aiRecommendation: 'APPROVE',
          riskFactors: [],
          baselineScore: 20,
        },
      });

      const context = new AgentContext({
        runId: 'r1',
        merchantId: 'm1',
        transactionId: 't1',
        transaction: { amount: 50 },
      })
        .withAgentResult(baselineResult)
        .withAgentResult(analystResult);

      const result = await verifier.execute(context);

      assert.equal(result.success, true);
      assert.equal(result.output.status, 'REJECTED');
      assert.ok(result.output.warnings.some((w) => w.includes('AI contract violation')));
      // Deterministic baseline authority must remain preserved
      assert.equal(result.output.baselineAuthority.riskScore, 20);
      assert.equal(result.output.baselineAuthority.recommendation, 'APPROVE');
    });

    it('Flags unsupported speculative claims as UNSUPPORTED_CLAIM and sets VERIFIED_WITH_WARNINGS', async () => {
      const verifier = new RiskVerificationAgent();

      const baselineResult = AgentResult.success({
        agentName: 'TRANSACTION_RISK_BASELINE',
        agentVersion: '1.0.0',
        output: { riskScore: 75, riskTier: 'HIGH', recommendation: 'DECLINE' },
      });

      // AI hallucinates account takeover and stolen card without evidence
      const analystResult = AgentResult.success({
        agentName: 'RISK_ANALYST',
        agentVersion: '1.0.0',
        output: {
          status: 'SUCCESS',
          aiScore: 85,
          aiTier: 'HIGH',
          aiRecommendation: 'DECLINE',
          riskFactors: [
            { code: 'SPEC_1', description: 'Suspected account takeover and stolen card in progress', severity: 'HIGH' },
          ],
          baselineScore: 75,
        },
      });

      const context = new AgentContext({
        runId: 'r1',
        merchantId: 'm1',
        transactionId: 't1',
        transaction: { amount: 1200 },
      })
        .withAgentResult(baselineResult)
        .withAgentResult(analystResult);

      const result = await verifier.execute(context);

      assert.equal(result.success, true);
      assert.equal(result.output.status, 'VERIFIED_WITH_WARNINGS');
      assert.equal(result.output.factorAnalysis[0].groundingStatus, 'UNSUPPORTED_CLAIM');
      assert.ok(result.output.warnings.some((w) => w.includes('Unsupported claim detected')));
    });

    it('Flags ungrounded AI factors lacking observable evidence as UNVERIFIED', async () => {
      const verifier = new RiskVerificationAgent();

      const baselineResult = AgentResult.success({
        agentName: 'TRANSACTION_RISK_BASELINE',
        agentVersion: '1.0.0',
        output: { riskScore: 10, riskTier: 'LOW', recommendation: 'APPROVE' },
      });

      // AI invents arbitrary semantic factor not connected to observable transaction attributes
      const analystResult = AgentResult.success({
        agentName: 'RISK_ANALYST',
        agentVersion: '1.0.0',
        output: {
          status: 'SUCCESS',
          aiScore: 15,
          aiTier: 'LOW',
          aiRecommendation: 'APPROVE',
          riskFactors: [
            { code: 'VAGUE_VIBE', description: 'Mysterious intuitive pattern observed', severity: 'LOW' },
          ],
          baselineScore: 10,
        },
      });

      const context = new AgentContext({
        runId: 'r1',
        merchantId: 'm1',
        transactionId: 't1',
        transaction: { amount: 25 },
      })
        .withAgentResult(baselineResult)
        .withAgentResult(analystResult);

      const result = await verifier.execute(context);

      assert.equal(result.success, true);
      assert.equal(result.output.status, 'VERIFIED_WITH_WARNINGS');
      assert.equal(result.output.factorAnalysis[0].groundingStatus, 'UNVERIFIED');
      assert.ok(result.output.warnings.some((w) => w.includes('Unverified factor lacking observable evidence')));
    });
  });

  // =========================================================================
  // 3. WORKFLOW & ORCHESTRATION PIPELINE INTEGRATION
  // =========================================================================
  describe('3. Multi-Agent Pipeline Integration (Baseline -> Analyst -> Verification)', () => {
    it('Executes the authoritative 3-agent workflow sequentially', async () => {
      aiRiskService.analyzeTransactionRisk = async () => ({
        success: true,
        status: 'SUCCESS',
        aiScore: 75,
        riskTier: 'HIGH',
        recommendation: 'DECLINE',
        summary: 'Elevated transaction value observed.',
        riskFactors: [
          { code: 'HIGH_VALUE', description: 'High transaction amount', severity: 'HIGH' },
        ],
      });

      const registry = new AgentRegistry();
      registry.register(new TransactionRiskBaselineAgent());
      registry.register(new RiskAnalystAgent());
      registry.register(new RiskVerificationAgent());

      const orchestrator = new Orchestrator({ registry, traceModel: null });

      const orchestration = await orchestrator.orchestrate({
        merchantId: '507f1f77bcf86cd799439011',
        transactionId: '64a1b2c3d4e5f6a7b8c9d001',
        transaction: {
          _id: '64a1b2c3d4e5f6a7b8c9d001',
          amount: 1500,
          currency: 'USD',
          customer: { email: 'vip@example.com' },
          cartItems: [{ title: 'Item', price: 100, quantity: 1 }],
        },
        agentNames: TRANSACTION_RISK_WORKFLOW,
      });

      assert.equal(orchestration.status, 'COMPLETED');
      assert.equal(orchestration.agents.length, 3);
      assert.equal(orchestration.agents[0].agentName, 'TRANSACTION_RISK_BASELINE');
      assert.equal(orchestration.agents[1].agentName, 'RISK_ANALYST');
      assert.equal(orchestration.agents[2].agentName, 'RISK_VERIFICATION');

      // Canonical decision authority MUST come from baseline
      assert.ok(orchestration.decision);
      assert.equal(orchestration.decision.authority, 'DETERMINISTIC_BASELINE');
      assert.equal(orchestration.decision.riskTier, 'HIGH');
      assert.equal(orchestration.decision.recommendation, 'DECLINE');

      // Verification summary
      assert.ok(orchestration.verification);
      assert.equal(orchestration.verification.status, 'VERIFIED');
      assert.equal(orchestration.verification.comparison.tierAgreement, true);
    });

    it('Completes orchestration safely when AI analyst is unavailable', async () => {
      aiRiskService.analyzeTransactionRisk = async () => ({
        success: false,
        status: 'UNAVAILABLE',
        error: 'Network connection refused',
      });

      const registry = new AgentRegistry();
      registry.register(new TransactionRiskBaselineAgent());
      registry.register(new RiskAnalystAgent());
      registry.register(new RiskVerificationAgent());

      const orchestrator = new Orchestrator({ registry, traceModel: null });

      const orchestration = await orchestrator.orchestrate({
        merchantId: '507f1f77bcf86cd799439011',
        transactionId: '64a1b2c3d4e5f6a7b8c9d001',
        transaction: {
          _id: '64a1b2c3d4e5f6a7b8c9d001',
          amount: 50,
          currency: 'USD',
        },
        agentNames: TRANSACTION_RISK_WORKFLOW,
      });

      assert.equal(orchestration.status, 'COMPLETED');
      assert.equal(orchestration.agents.length, 3);
      assert.equal(orchestration.agents[1].output.status, 'UNAVAILABLE');
      assert.equal(orchestration.verification.status, 'AI_UNAVAILABLE');
      // Baseline decision is preserved!
      assert.equal(orchestration.decision.authority, 'DETERMINISTIC_BASELINE');
      assert.equal(orchestration.decision.riskTier, 'LOW');
      assert.equal(orchestration.decision.recommendation, 'APPROVE');
    });
  });
});
