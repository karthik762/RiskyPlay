/**
 * Agent — Base abstract class for all RiskyPlay agents.
 * Defines standardized lifecycle, metadata contract, and execution interface.
 */

const AgentResult = require('./AgentResult');
const AgentError = require('./AgentError');

class Agent {
  /**
   * @param {Object} config
   * @param {string} config.name - Stable, unique agent name
   * @param {string} config.version - Semantic version string (e.g. '1.0.0')
   * @param {string} config.description - Concise functional summary
   */
  constructor({ name, version, description }) {
    if (new.target === Agent) {
      throw new TypeError('Agent is an abstract class and cannot be instantiated directly');
    }
    if (!name || typeof name !== 'string') {
      throw new TypeError('Agent requires a non-empty string name');
    }
    if (!version || typeof version !== 'string') {
      throw new TypeError('Agent requires a non-empty string version');
    }
    if (!description || typeof description !== 'string') {
      throw new TypeError('Agent requires a non-empty string description');
    }

    this.name = name;
    this.version = version;
    this.description = description;

    Object.freeze(this);
  }

  /**
   * Abstract execution method to be implemented by concrete agent subclasses.
   *
   * @param {import('./AgentContext')} context - Immutable execution context
   * @returns {Promise<AgentResult>} Standardized execution result
   * @throws {AgentError} On execution or invariant failure
   */
  async execute(context) { // eslint-disable-line no-unused-vars
    throw new AgentError(
      'NOT_IMPLEMENTED',
      `execute() method must be implemented by Agent subclass '${this.name}'`,
      this.name
    );
  }

  /**
   * Validates that an object satisfies the AgentResult contract.
   *
   * @param {*} result
   * @returns {boolean}
   */
  isValidResult(result) {
    return (
      result instanceof AgentResult ||
      (result &&
        typeof result.success === 'boolean' &&
        typeof result.agentName === 'string' &&
        typeof result.agentVersion === 'string')
    );
  }
}

module.exports = Agent;
