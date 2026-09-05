'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  Agent,
  AgentContext,
  AgentResult,
  AgentError,
  AgentRegistry,
  Orchestrator,
  Tool,
  TransactionRiskBaselineAgent,
} = require('../src/agents');

// Mock test agent subclass
class MockValidAgent extends Agent {
  constructor(name = 'MOCK_AGENT', version = '1.0.0') {
    super({
      name,
      version,
      description: 'Mock test agent for unit testing',
    });
  }

  async execute(context) {
    return AgentResult.success({
      agentName: this.name,
      agentVersion: this.version,
      output: { evaluatedId: context.transactionId, customMetric: 42 },
      reasoning: { ruleEvaluated: 'MOCK_RULE', decisionProduced: 'APPROVE' },
    });
  }
}

class MockFailingAgent extends Agent {
  constructor() {
    super({
      name: 'MOCK_FAILING_AGENT',
      version: '1.0.0',
      description: 'Mock agent that intentionally fails',
    });
  }

  async execute() {
    throw new Error('Simulated internal agent exception');
  }
}

class MockHangingAgent extends Agent {
  constructor() {
    super({
      name: 'MOCK_HANGING_AGENT',
      version: '1.0.0',
      description: 'Mock agent that simulates long latency/hang',
    });
  }

  async execute() {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return AgentResult.success({
      agentName: this.name,
      agentVersion: this.version,
      output: { delayed: true },
    });
  }
}

class MockMalformedOutputAgent extends Agent {
  constructor() {
    super({
      name: 'MOCK_MALFORMED_AGENT',
      version: '1.0.0',
      description: 'Mock agent returning non-conformant output',
    });
  }

  async execute() {
    return 'not a valid agent result object';
  }
}

class MockUnimplementedAgent extends Agent {
  constructor() {
    super({
      name: 'MOCK_UNIMPLEMENTED',
      version: '1.0.0',
      description: 'Agent missing execute implementation',
    });
  }
}

class MockTool extends Tool {
  constructor() {
    super({
      name: 'MOCK_TOOL',
      version: '1.0.0',
      description: 'Safe mock evaluation tool',
    });
  }

  validateInput(params) {
    super.validateInput(params);
    if (!params.query) {
      throw new AgentError('TOOL_VALIDATION', 'Missing required query param');
    }
  }

  async execute(params) {
    return { found: true, query: params.query };
  }
}

describe('MULTI-AGENT ORCHESTRATOR — UNIT & CONTRACT TESTS', () => {
  // =========================================================================
  // 1. AGENT CONTRACT TESTS
  // =========================================================================
  describe('1. Agent Contract', () => {
    it('Rejects direct instantiation of abstract Agent base class', () => {
      assert.throws(() => new Agent({ name: 'A', version: '1.0.0', description: 'D' }), TypeError);
    });

    it('Rejects agent subclass missing required metadata', () => {
      assert.throws(() => new MockValidAgent('', '1.0.0'), TypeError);
      assert.throws(() => new MockValidAgent('A', ''), TypeError);
    });

    it('Subclass without execute() implementation throws AgentError with NOT_IMPLEMENTED', async () => {
      const agent = new MockUnimplementedAgent();
      const context = new AgentContext({
        runId: 'run-1',
        merchantId: 'm-1',
        transactionId: 't-1',
        transaction: { amount: 100 },
      });

      await assert.rejects(
        () => agent.execute(context),
        (err) => err instanceof AgentError && err.code === 'NOT_IMPLEMENTED'
      );
    });

    it('Valid agent executes successfully and satisfies AgentResult contract', async () => {
      const agent = new MockValidAgent();
      const context = new AgentContext({
        runId: 'run-1',
        merchantId: 'm-1',
        transactionId: 't-1',
        transaction: { amount: 100 },
      });

      const result = await agent.execute(context);
      assert.equal(result.success, true);
      assert.equal(result.agentName, 'MOCK_AGENT');
      assert.equal(result.agentVersion, '1.0.0');
      assert.equal(result.output.evaluatedId, 't-1');
      assert.equal(result.output.customMetric, 42);
      assert.equal(result.reasoning.ruleEvaluated, 'MOCK_RULE');
    });
  });

  // =========================================================================
  // 2. AGENT RESULT CONTRACT
  // =========================================================================
  describe('2. AgentResult Contract', () => {
    it('Creates valid success and failure results using static factories', () => {
      const successResult = AgentResult.success({
        agentName: 'A1',
        agentVersion: '1.0.0',
        output: { score: 10 },
        reasoning: { rule: 'R1' },
      });
      assert.equal(successResult.success, true);
      assert.equal(successResult.output.score, 10);
      assert.equal(successResult.error, null);

      const failResult = AgentResult.failure({
        agentName: 'A2',
        agentVersion: '1.0.0',
        error: { code: 'FAIL', message: 'Something went wrong' },
      });
      assert.equal(failResult.success, false);
      assert.equal(failResult.output, null);
      assert.equal(failResult.error.code, 'FAIL');
    });

    it('Defensively freezes output and reasoning to prevent post-execution mutation', () => {
      const output = { key: 'initial' };
      const result = AgentResult.success({
        agentName: 'A1',
        agentVersion: '1.0.0',
        output,
      });

      assert.throws(() => {
        result.output.key = 'mutated';
      }, TypeError);

      assert.throws(() => {
        result.success = false;
      }, TypeError);
    });

    it('Rejects instantiation missing mandatory properties', () => {
      assert.throws(() => new AgentResult({}), TypeError);
      assert.throws(() => new AgentResult({ success: true }), TypeError);
    });
  });

  // =========================================================================
  // 3. AGENT CONTEXT IMMUTABILITY & TENANT SECURITY
  // =========================================================================
  describe('3. AgentContext Security & Immutability', () => {
    it('Requires runId, merchantId, and transactionId', () => {
      assert.throws(() => new AgentContext({ merchantId: 'm1', transactionId: 't1' }), TypeError);
      assert.throws(() => new AgentContext({ runId: 'r1', transactionId: 't1' }), TypeError);
      assert.throws(() => new AgentContext({ runId: 'r1', merchantId: 'm1' }), TypeError);
    });

    it('Defensively freezes transaction object and prevents mutation', () => {
      const rawTx = {
        amount: 250,
        currency: 'USD',
        customer: { email: 'user@test.com' },
      };

      const context = new AgentContext({
        runId: 'r1',
        merchantId: 'm1',
        transactionId: 't1',
        transaction: rawTx,
      });

      assert.throws(() => {
        context.transaction.amount = 999;
      }, TypeError);

      assert.throws(() => {
        context.transaction.customer.email = 'hacked@test.com';
      }, TypeError);

      assert.equal(context.transaction.amount, 250);
    });

    it('Strips sensitive payment secrets (CVV, PAN, passwordHash, jwtToken)', () => {
      const rawTx = {
        amount: 100,
        cvv: '123',
        pan: '4111111111111111',
        passwordHash: 'secret_hash',
        jwtToken: 'bearer_token',
        customer: { email: 'clean@test.com' },
      };

      const context = new AgentContext({
        runId: 'r1',
        merchantId: 'm1',
        transactionId: 't1',
        transaction: rawTx,
      });

      assert.equal(context.transaction.cvv, undefined);
      assert.equal(context.transaction.pan, undefined);
      assert.equal(context.transaction.passwordHash, undefined);
      assert.equal(context.transaction.jwtToken, undefined);
      assert.equal(context.transaction.customer.email, 'clean@test.com');
    });

    it('withAgentResult returns a new instance without mutating previous context', () => {
      const context1 = new AgentContext({
        runId: 'r1',
        merchantId: 'm1',
        transactionId: 't1',
        transaction: { amount: 100 },
      });

      assert.equal(context1.hasResult('AGENT_A'), false);

      const resultA = AgentResult.success({
        agentName: 'AGENT_A',
        agentVersion: '1.0.0',
        output: { score: 25 },
      });

      const context2 = context1.withAgentResult(resultA);

      // Context 1 remains untouched
      assert.equal(context1.hasResult('AGENT_A'), false);
      assert.equal(context1.getResult('AGENT_A'), null);

      // Context 2 contains new result
      assert.equal(context2.hasResult('AGENT_A'), true);
      assert.deepEqual(context2.getResult('AGENT_A'), { score: 25 });
    });
  });

  // =========================================================================
  // 4. AGENT REGISTRY
  // =========================================================================
  describe('4. AgentRegistry', () => {
    it('Registers, lists, and retrieves agents by name', () => {
      const registry = new AgentRegistry();
      const agent = new MockValidAgent('TEST_AGENT');

      registry.register(agent);

      assert.equal(registry.has('TEST_AGENT'), true);
      assert.equal(registry.get('TEST_AGENT'), agent);

      const list = registry.list();
      assert.equal(list.length, 1);
      assert.equal(list[0].name, 'TEST_AGENT');
    });

    it('Rejects duplicate registration with AGENT_DUPLICATE_REGISTRATION', () => {
      const registry = new AgentRegistry();
      const agent1 = new MockValidAgent('DUP_AGENT');
      const agent2 = new MockValidAgent('DUP_AGENT');

      registry.register(agent1);
      assert.throws(
        () => registry.register(agent2),
        (err) => err instanceof AgentError && err.code === 'AGENT_DUPLICATE_REGISTRATION'
      );
    });

    it('Rejects invalid agent definitions', () => {
      const registry = new AgentRegistry();
      assert.throws(
        () => registry.register({}),
        (err) => err instanceof AgentError && err.code === 'INVALID_AGENT_DEFINITION'
      );
    });

    it('Throws AGENT_NOT_FOUND when retrieving unknown agent', () => {
      const registry = new AgentRegistry();
      assert.throws(
        () => registry.get('UNKNOWN_AGENT'),
        (err) => err instanceof AgentError && err.code === 'AGENT_NOT_FOUND'
      );
    });
  });

  // =========================================================================
  // 5. TOOL CONTRACT & SAFETY
  // =========================================================================
  describe('5. Tool Contract & Safety Boundaries', () => {
    it('Rejects direct instantiation of Tool abstract class', () => {
      assert.throws(() => new Tool({ name: 'T', version: '1.0.0', description: 'D' }), TypeError);
    });

    it('Validates tool input and returns validated output', async () => {
      const tool = new MockTool();

      await assert.rejects(
        () => tool.run(null),
        (err) => err instanceof AgentError && err.code === 'TOOL_INVALID_INPUT'
      );

      await assert.rejects(
        () => tool.run({}),
        (err) => err instanceof AgentError && err.code === 'TOOL_VALIDATION'
      );

      const output = await tool.run({ query: 'risk_check' });
      assert.equal(output.found, true);
      assert.equal(output.query, 'risk_check');
    });
  });

  // =========================================================================
  // 6. TRANSACTION RISK BASELINE AGENT
  // =========================================================================
  describe('6. TransactionRiskBaselineAgent', () => {
    it('Executes and extracts structured baseline metrics without duplicating rules', async () => {
      const baselineAgent = new TransactionRiskBaselineAgent();
      assert.equal(baselineAgent.name, 'TRANSACTION_RISK_BASELINE');

      const context = new AgentContext({
        runId: 'r1',
        merchantId: 'm1',
        transactionId: 't1',
        transaction: {
          amount: 1500,
          currency: 'USD',
          customer: { email: 'shopper@test.com' },
        },
      });

      const result = await baselineAgent.execute(context);

      assert.equal(result.success, true);
      assert.equal(result.agentName, 'TRANSACTION_RISK_BASELINE');
      assert.ok(typeof result.output.riskScore === 'number');
      assert.ok(['LOW', 'MEDIUM', 'HIGH'].includes(result.output.riskTier));
      assert.ok(['APPROVE', 'REVIEW', 'DECLINE'].includes(result.output.recommendation));
      assert.ok(Array.isArray(result.output.matchedRules));
      assert.ok(result.reasoning.ruleEvaluated);
    });
  });

  // =========================================================================
  // 7. ORCHESTRATOR EXECUTION & TIMEOUT HANDLING
  // =========================================================================
  describe('7. Orchestrator Pipeline', () => {
    it('Executes registered agents sequentially and produces structured result', async () => {
      const registry = new AgentRegistry();
      registry.register(new MockValidAgent('AGENT_1'));
      registry.register(new MockValidAgent('AGENT_2'));

      // Mock trace model that collects traces in-memory
      const recordedTraces = [];
      const mockTraceModel = {
        create: async (data) => recordedTraces.push(data),
      };

      const orchestrator = new Orchestrator({ registry, traceModel: mockTraceModel });

      const orchestration = await orchestrator.orchestrate({
        merchantId: 'm1',
        transactionId: 't1',
        transaction: { amount: 100, currency: 'USD' },
        agentNames: ['AGENT_1', 'AGENT_2'],
      });

      assert.equal(orchestration.status, 'COMPLETED');
      assert.ok(orchestration.runId);
      assert.equal(orchestration.agents.length, 2);
      assert.equal(orchestration.agents[0].agentName, 'AGENT_1');
      assert.equal(orchestration.agents[0].status, 'COMPLETED');
      assert.equal(orchestration.agents[1].agentName, 'AGENT_2');
      assert.equal(orchestration.agents[1].status, 'COMPLETED');

      // Verify traces
      assert.equal(recordedTraces.length, 2);
      assert.equal(recordedTraces[0].runId, orchestration.runId);
      assert.equal(recordedTraces[0].stepIndex, 0);
      assert.equal(recordedTraces[1].stepIndex, 1);
    });

    it('Enforces agent timeout and records TIMEOUT status gracefully', async () => {
      const registry = new AgentRegistry();
      registry.register(new MockHangingAgent());

      const recordedTraces = [];
      const mockTraceModel = {
        create: async (data) => recordedTraces.push(data),
      };

      const orchestrator = new Orchestrator({
        registry,
        traceModel: mockTraceModel,
        defaultTimeoutMs: 50, // 50ms limit; agent hangs for 500ms
      });

      const orchestration = await orchestrator.orchestrate({
        merchantId: 'm1',
        transactionId: 't1',
        transaction: { amount: 100 },
        agentNames: ['MOCK_HANGING_AGENT'],
      });

      assert.equal(orchestration.status, 'FAILED');
      assert.equal(orchestration.agents[0].status, 'TIMEOUT');
      assert.equal(orchestration.agents[0].error.code, 'AGENT_TIMEOUT');
      assert.match(orchestration.agents[0].error.message, /timed out/);

      assert.equal(recordedTraces.length, 1);
      assert.equal(recordedTraces[0].status, 'TIMEOUT');
    });

    it('Handles synchronous agent exception gracefully without crashing', async () => {
      const registry = new AgentRegistry();
      registry.register(new MockFailingAgent());

      const orchestrator = new Orchestrator({ registry, traceModel: null });

      const orchestration = await orchestrator.orchestrate({
        merchantId: 'm1',
        transactionId: 't1',
        transaction: { amount: 100 },
        agentNames: ['MOCK_FAILING_AGENT'],
      });

      assert.equal(orchestration.status, 'FAILED');
      assert.equal(orchestration.agents[0].status, 'FAILED');
      assert.match(orchestration.agents[0].error.message, /Simulated internal agent exception/);
    });

    it('Handles malformed agent result gracefully with MALFORMED_AGENT_RESULT', async () => {
      const registry = new AgentRegistry();
      registry.register(new MockMalformedOutputAgent());

      const orchestrator = new Orchestrator({ registry, traceModel: null });

      const orchestration = await orchestrator.orchestrate({
        merchantId: 'm1',
        transactionId: 't1',
        transaction: { amount: 100 },
        agentNames: ['MOCK_MALFORMED_AGENT'],
      });

      assert.equal(orchestration.status, 'FAILED');
      assert.equal(orchestration.agents[0].status, 'FAILED');
      assert.equal(orchestration.agents[0].error.code, 'MALFORMED_AGENT_RESULT');
    });

    it('Handles unknown agent name in pipeline with AGENT_NOT_FOUND', async () => {
      const registry = new AgentRegistry();
      const orchestrator = new Orchestrator({ registry, traceModel: null });

      const orchestration = await orchestrator.orchestrate({
        merchantId: 'm1',
        transactionId: 't1',
        transaction: { amount: 100 },
        agentNames: ['UNREGISTERED_AGENT'],
      });

      assert.equal(orchestration.status, 'FAILED');
      assert.equal(orchestration.agents[0].status, 'FAILED');
      assert.equal(orchestration.agents[0].error.code, 'AGENT_NOT_FOUND');
    });
  });
});
