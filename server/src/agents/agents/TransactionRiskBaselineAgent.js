/**
 * TransactionRiskBaselineAgent — Demonstration agent that integrates the deterministic
 * risk engine into the multi-agent orchestrator.
 * Strictly avoids duplicating risk calculation logic; delegates to the authoritative riskService.
 */

const Agent = require('../core/Agent');
const AgentResult = require('../core/AgentResult');
const riskService = require('../../services/riskService');

class TransactionRiskBaselineAgent extends Agent {
  constructor() {
    super({
      name: 'TRANSACTION_RISK_BASELINE',
      version: '1.0.0',
      description: 'Evaluates transaction against deterministic fraud rules and outputs structured baseline metrics',
    });
  }

  /**
   * Executes the baseline evaluation agent.
   *
   * @param {import('../core/AgentContext')} context - Execution context
   * @returns {Promise<AgentResult>}
   */
  async execute(context) {
    // 1. Retrieve or calculate deterministic risk evaluation without duplicating logic
    let assessment = context.deterministicAssessment;
    if (!assessment) {
      assessment = riskService.calculateRisk(context.transaction);
    }

    const matchedRules = Array.isArray(assessment.ruleMatches)
      ? assessment.ruleMatches.map((r) => r.rule || r.ruleId)
      : [];

    const signals = Array.isArray(assessment.signals)
      ? assessment.signals.map((s) => ({
          code: s.code,
          severity: s.severity,
          description: s.description,
        }))
      : [];

    // 2. Format structured output
    const output = {
      riskScore: assessment.riskScore,
      riskTier: assessment.riskTier,
      recommendation: assessment.recommendation,
      signalsCount: signals.length,
      matchedRulesCount: matchedRules.length,
      matchedRules,
      signals,
    };

    // 3. Capture structured operational reasoning (NEVER private chain-of-thought)
    const reasoning = {
      ruleEvaluated: 'DETERMINISTIC_BASELINE_RULES',
      evidenceConsidered: `Transaction amount ${context.transaction.amount || 0} ${context.transaction.currency || 'USD'} with ${matchedRules.length} rule matches`,
      decisionProduced: `${assessment.riskTier} risk tier (${assessment.riskScore}/100) recommending ${assessment.recommendation}`,
    };

    return AgentResult.success({
      agentName: this.name,
      agentVersion: this.version,
      output,
      reasoning,
    });
  }
}

module.exports = TransactionRiskBaselineAgent;
