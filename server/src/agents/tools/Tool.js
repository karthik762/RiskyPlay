/**
 * Tool — Controlled tool execution boundary for agents.
 * Strictly prohibits shell execution, arbitrary database queries, arbitrary HTTP,
 * filesystem access, or external web browsing.
 */

const AgentError = require('../core/AgentError');

class Tool {
  /**
   * @param {Object} config
   * @param {string} config.name - Tool name
   * @param {string} config.version - Tool version
   * @param {string} config.description - Functional description
   */
  constructor({ name, version, description }) {
    if (new.target === Tool) {
      throw new TypeError('Tool is an abstract class and cannot be instantiated directly');
    }
    if (!name || typeof name !== 'string') {
      throw new TypeError('Tool requires a non-empty string name');
    }
    if (!version || typeof version !== 'string') {
      throw new TypeError('Tool requires a non-empty string version');
    }
    if (!description || typeof description !== 'string') {
      throw new TypeError('Tool requires a non-empty string description');
    }

    this.name = name;
    this.version = version;
    this.description = description;

    Object.freeze(this);
  }

  /**
   * Validates input parameters before execution.
   * Default implementation permits object inputs; subclasses should specialize.
   *
   * @param {*} params
   * @throws {AgentError} If inputs fail validation
   */
  validateInput(params) {
    if (params === undefined || params === null) {
      throw new AgentError('TOOL_INVALID_INPUT', `Tool '${this.name}' received null or undefined input`, this.name);
    }
  }

  /**
   * Validates output results following execution.
   *
   * @param {*} output
   * @throws {AgentError} If outputs fail validation
   */
  validateOutput(output) {
    if (output === undefined) {
      throw new AgentError('TOOL_INVALID_OUTPUT', `Tool '${this.name}' produced undefined output`, this.name);
    }
  }

  /**
   * Abstract execution method.
   *
   * @param {*} params - Input parameters
   * @returns {Promise<*>}
   */
  async execute(params) { // eslint-disable-line no-unused-vars
    throw new AgentError('TOOL_NOT_IMPLEMENTED', `execute() not implemented on tool '${this.name}'`, this.name);
  }

  /**
   * Safe execution wrapper that runs input validation, execution, and output validation.
   *
   * @param {*} params
   * @returns {Promise<*>}
   */
  async run(params) {
    this.validateInput(params);
    const result = await this.execute(params);
    this.validateOutput(result);
    return result;
  }
}

module.exports = Tool;
