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
const ChargebackResponseAgent = require('./chargeback/ChargebackResponseAgent');
const ChargebackResponseVerificationAgent = require('./chargeback/ChargebackResponseVerificationAgent');

/**
 * Authoritative sequential workflow for transaction risk analysis.
 * Baseline (deterministic) -> Analyst (AI advisory) -> Verification (deterministic guardrails).
 */
const TRANSACTION_RISK_WORKFLOW = Object.freeze([
  'TRANSACTION_RISK_BASELINE',
  'RISK_ANALYST',
  'RISK_VERIFICATION',
]);

/**
 * Authoritative sequential workflow for defensive chargeback response generation.
 * Response Drafting (AI advisory) -> Response Verification (deterministic guardrails).
 */
const CHARGEBACK_RESPONSE_WORKFLOW = Object.freeze([
  'CHARGEBACK_RESPONSE',
  'CHARGEBACK_RESPONSE_VERIFICATION',
]);

// Global server-side registry instance
const defaultRegistry = new AgentRegistry();

// Register specialized agents
defaultRegistry.register(new TransactionRiskBaselineAgent());
defaultRegistry.register(new RiskAnalystAgent());
defaultRegistry.register(new RiskVerificationAgent());
defaultRegistry.register(new ChargebackResponseAgent());
defaultRegistry.register(new ChargebackResponseVerificationAgent());

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
  ChargebackResponseAgent,
  ChargebackResponseVerificationAgent,
  TRANSACTION_RISK_WORKFLOW,
  CHARGEBACK_RESPONSE_WORKFLOW,
  defaultRegistry,
  defaultOrchestrator,
};

