/**
 * RiskyPlay Multi-Agent Orchestration Module.
 * Exports core contracts, default initialized registry, and orchestrator.
 */

const Agent = require('./core/Agent');
const AgentContext = require('./core/AgentContext');
const AgentResult = require('./core/AgentResult');
const AgentError = require('./core/AgentError');
const AgentRegistry = require('./core/AgentRegistry');
const Orchestrator = require('./core/Orchestrator');
const Tool = require('./tools/Tool');
const TransactionRiskBaselineAgent = require('./agents/TransactionRiskBaselineAgent');

// Global server-side registry instance
const defaultRegistry = new AgentRegistry();

// Register demonstration baseline agent
const baselineAgent = new TransactionRiskBaselineAgent();
defaultRegistry.register(baselineAgent);

// Global server-side orchestrator instance
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
  defaultRegistry,
  defaultOrchestrator,
};
