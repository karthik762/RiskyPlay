/**
 * AgentError — Domain-specific error class for multi-agent orchestration.
 */

class AgentError extends Error {
  /**
   * @param {string} code - Machine-readable error code
   * @param {string} message - Human-readable error description
   * @param {string} [agentName] - Associated agent name if applicable
   * @param {*} [details] - Optional structured error context
   */
  constructor(code, message, agentName = null, details = null) {
    super(message);
    this.name = 'AgentError';
    this.code = code || 'AGENT_ERROR';
    this.agentName = agentName;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AgentError;
