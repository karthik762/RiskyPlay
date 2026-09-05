/**
 * RiskyPlay Multi-Agent Orchestration Module.
 * Exports core contracts, specialized agents, default workflow, registry, and orchestrator.
 */

'use strict';

const Agent = require('./core/Agent');
const AgentContext = require('./core/AgentContext');
const AgentResult = require('./core/AgentResult');
const AgentError = require('./core/AgentError');
const AgentRegistry = require('./core/AgentRegistry');
const Orchestrator = require('./core/Orchestrator');
const Tool = require('./tools/Tool');

const TransactionRiskBaselineAgent = require('./agents/TransactionRiskBaselineAgent');
const RiskAnalystAgent = require('./agents/RiskAnalystAgent');
const RiskVerificationAgent = require('./agents/RiskVerificationAgent');

/**
 * Authoritative sequential workflow for transaction risk analysis.
 * Baseline (deterministic) -> Analyst (AI advisory) -> Verification (deterministic guardrails).
 */
const TRANSACTION_RISK_WORKFLOW = Object.freeze([
  'TRANSACTION_RISK_BASELINE',
  'RISK_ANALYST',
  'RISK_VERIFICATION',
]);

// Global server-side registry instance
const defaultRegistry = new AgentRegistry();

// Register specialized agents
defaultRegistry.register(new TransactionRiskBaselineAgent());
defaultRegistry.register(new RiskAnalystAgent());
defaultRegistry.register(new RiskVerificationAgent());

// Global server-side orchestrator instance configured with default registry
const defaultOrchestrator = new Orchestrator({
  registry: defaultRegistry,
});

module.exports = {
  Agent,
  AgentContext,
  AgentResult,
  AgentError,
  AgentRegistry,
  Orchestrator,
  Tool,
  TransactionRiskBaselineAgent,
  RiskAnalystAgent,
  RiskVerificationAgent,
  TRANSACTION_RISK_WORKFLOW,
  defaultRegistry,
  defaultOrchestrator,
};
