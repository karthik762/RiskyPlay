/**
 * RiskAnalystAgent — Specialized AI risk analysis agent.
 * Consumes the transaction context and deterministic baseline, invoking the existing
 * aiRiskService to produce advisory risk insights, explanations, and risk factors.
 * Strictly maintains defense-only posture and never acts as canonical financial authority.
 */

'use strict';

const Agent = require('../core/Agent');
const AgentResult = require('../core/AgentResult');
const AgentError = require('../core/AgentError');
const aiRiskService = require('../../services/aiRiskService');

class RiskAnalystAgent extends Agent {
  constructor() {
    super({
      name: 'RISK_ANALYST',
      version: '1.0.0',
      description: 'Analyzes transaction and baseline risk using AI advisory service with graceful degradation',
    });
  }

  /**
   * Executes AI risk analysis using predecessor baseline evaluation.
   *
   * @param {import('../core/AgentContext')} context - Execution context
   * @returns {Promise<AgentResult>}
   */
  async execute(context) {
    // 1. Dependency check: Requires deterministic baseline predecessor result
    const baseline = context.getResult('TRANSACTION_RISK_BASELINE') || context.deterministicAssessment;
    if (!baseline || typeof baseline.riskScore !== 'number') {
      throw new AgentError(
        'MISSING_PREDECESSOR_RESULT',
        "RiskAnalystAgent requires 'TRANSACTION_RISK_BASELINE' predecessor result",
        this.name
      );
    }

    // 2. Invoke existing aiRiskService client (defense-only, no direct transport/secrets)
    const aiResult = await aiRiskService.analyzeTransactionRisk(
      context.transaction,
      baseline
    );

    let output;
    let decisionProduced;

    if (aiResult.success) {
      output = {
        status: 'SUCCESS',
        aiScore: aiResult.aiScore,
        aiTier: aiResult.riskTier,
        aiRecommendation: aiResult.recommendation,
        summary: aiResult.summary || '',
        riskFactors: Array.isArray(aiResult.riskFactors) ? aiResult.riskFactors : [],
        baselineScore: baseline.riskScore,
      };
      decisionProduced = `AI advisory score ${aiResult.aiScore} (${aiResult.riskTier}) recommending ${aiResult.recommendation}`;
    } else {
      // Graceful degradation: never crash orchestration or invent fake scores
      output = {
        status: aiResult.status || 'UNAVAILABLE',
        aiScore: null,
        aiTier: null,
        aiRecommendation: null,
        summary: '',
        riskFactors: [],
        baselineScore: baseline.riskScore,
        error: aiResult.error || 'AI risk service unavailable',
      };
      decisionProduced = `AI advisory unavailable (${aiResult.status || 'UNAVAILABLE'}): ${aiResult.error || 'fallback to deterministic baseline'}`;
    }

    // 3. Structured operational reasoning (never private chain-of-thought or prompt scratchpads)
    const reasoning = {
      evidenceConsidered: [
        `transaction amount ${context.transaction.amount || 0} ${context.transaction.currency || 'USD'}`,
        `baseline riskScore ${baseline.riskScore} (${baseline.riskTier || 'UNKNOWN'})`,
      ],
      validationPerformed: [
        'predecessor baseline dependency check',
        'AI response contract validation',
      ],
      decisionProduced,
    };

    return AgentResult.success({
      agentName: this.name,
      agentVersion: this.version,
      output,
      reasoning,
    });
  }
}

module.exports = RiskAnalystAgent;
