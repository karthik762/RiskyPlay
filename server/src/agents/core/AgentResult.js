/**
 * AgentResult — Standardized output contract produced by every RiskyPlay agent.
 * Strictly forbids raw, hidden chain-of-thought scratchpads.
 * Only captures structured operational reasoning (e.g. rule evaluated, decision produced).
 */

class AgentResult {
  /**
   * @param {Object} params
   * @param {boolean} params.success - Whether agent completed successfully
   * @param {string} params.agentName - Stable name of the executing agent
   * @param {string} params.agentVersion - Semantic version of the agent
   * @param {Object|null} [params.output] - Structured output data
   * @param {Object|null} [params.error] - Error details { code, message } if failed
   * @param {Object|null} [params.reasoning] - Operational reasoning (structured rules/evidence)
   * @param {Object} [params.metadata] - Execution metadata (latency, timestamps, tokens)
   */
  constructor({
    success,
    agentName,
    agentVersion,
    output = null,
    error = null,
    reasoning = null,
    metadata = {},
  }) {
    if (typeof success !== 'boolean') {
      throw new TypeError('AgentResult requires a boolean success property');
    }
    if (!agentName || typeof agentName !== 'string') {
      throw new TypeError('AgentResult requires a string agentName');
    }
    if (!agentVersion || typeof agentVersion !== 'string') {
      throw new TypeError('AgentResult requires a string agentVersion');
    }

    this.success = success;
    this.agentName = agentName;
    this.agentVersion = agentVersion;
    this.output = output ? Object.freeze(JSON.parse(JSON.stringify(output))) : null;
    this.error = error ? Object.freeze({ code: error.code || 'AGENT_ERROR', message: error.message || 'Agent error' }) : null;
    this.reasoning = reasoning ? Object.freeze(JSON.parse(JSON.stringify(reasoning))) : null;
    this.metadata = Object.freeze({
      latencyMs: metadata.latencyMs ?? 0,
      timestamp: metadata.timestamp || new Date().toISOString(),
      modelUsed: metadata.modelUsed || null,
      tokensUsed: metadata.tokensUsed ?? 0,
      ...metadata,
    });

    Object.freeze(this);
  }

  /**
   * Factory for successful agent execution.
   */
  static success({ agentName, agentVersion, output = {}, reasoning = null, metadata = {} }) {
    return new AgentResult({
      success: true,
      agentName,
      agentVersion,
      output,
      error: null,
      reasoning,
      metadata,
    });
  }

  /**
   * Factory for failed agent execution.
   */
  static failure({ agentName, agentVersion, error, reasoning = null, metadata = {} }) {
    return new AgentResult({
      success: false,
      agentName,
      agentVersion,
      output: null,
      error: typeof error === 'string' ? { code: 'AGENT_EXECUTION_FAILED', message: error } : error,
      reasoning,
      metadata,
    });
  }
}

module.exports = AgentResult;
