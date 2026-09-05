/**
 * AgentRegistry — Central in-memory registry for authorized agents.
 * Strictly controlled server-side; forbids arbitrary runtime registration from HTTP requests.
 */

const Agent = require('./Agent');
const AgentError = require('./AgentError');

class AgentRegistry {
  constructor() {
    this._agents = new Map();
  }

  /**
   * Registers a new agent in the system.
   *
   * @param {Agent} agent - Agent instance to register
   * @throws {AgentError} If the agent is invalid or already registered
   */
  register(agent) {
    if (!agent || !(agent instanceof Agent)) {
      // Allow duck-typing if subclassing edge cases exist, but require necessary properties
      const isDuckAgent =
        agent &&
        typeof agent.name === 'string' &&
        typeof agent.version === 'string' &&
        typeof agent.description === 'string' &&
        typeof agent.execute === 'function';

      if (!isDuckAgent) {
        throw new AgentError(
          'INVALID_AGENT_DEFINITION',
          'Agent must be an instance of Agent with valid name, version, description, and execute method'
        );
      }
    }

    if (this._agents.has(agent.name)) {
      throw new AgentError(
        'AGENT_DUPLICATE_REGISTRATION',
        `Agent with name '${agent.name}' is already registered`,
        agent.name
      );
    }

    this._agents.set(agent.name, agent);
  }

  /**
   * Retrieves a registered agent by name.
   *
   * @param {string} name - Agent name
   * @returns {Agent} Registered agent instance
   * @throws {AgentError} If the agent is not found
   */
  get(name) {
    if (!name || typeof name !== 'string') {
      throw new AgentError('INVALID_AGENT_NAME', 'Agent name must be a non-empty string');
    }

    const agent = this._agents.get(name);
    if (!agent) {
      throw new AgentError(
        'AGENT_NOT_FOUND',
        `Agent '${name}' is not registered in the agent registry`,
        name
      );
    }

    return agent;
  }

  /**
   * Checks whether an agent is registered.
   *
   * @param {string} name - Agent name
   * @returns {boolean}
   */
  has(name) {
    return this._agents.has(name);
  }

  /**
   * Lists metadata for all registered agents.
   *
   * @returns {Array<{ name: string, version: string, description: string }>}
   */
  list() {
    return Array.from(this._agents.values()).map((agent) => ({
      name: agent.name,
      version: agent.version,
      description: agent.description,
    }));
  }

  /**
   * Unregisters an agent (primarily for testing isolation).
   *
   * @param {string} name - Agent name
   * @returns {boolean} True if removed
   */
  unregister(name) {
    return this._agents.delete(name);
  }

  /**
   * Clears all registered agents.
   */
  clear() {
    this._agents.clear();
  }
}

module.exports = AgentRegistry;
