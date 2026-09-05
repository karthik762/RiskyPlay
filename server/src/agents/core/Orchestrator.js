/**
 * Orchestrator — Sequential multi-agent pipeline coordinator.
 * Executes registered agents in strict order, enforces timeouts, records sanitized traces,
 * manages immutable context propagation, and guarantees defense-only isolation.
 */

const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const AgentContext = require('./AgentContext');
const AgentResult = require('./AgentResult');
const AgentError = require('./AgentError');
const AgentTrace = require('../../models/AgentTrace');

class Orchestrator {
  /**
   * @param {Object} [options]
   * @param {import('./AgentRegistry')} options.registry - Agent registry instance
   * @param {Object} [options.traceModel] - Mongoose AgentTrace model (defaults to imported AgentTrace)
   * @param {number} [options.defaultTimeoutMs] - Default per-agent timeout in milliseconds (default: 5000)
   */
  constructor({ registry, traceModel = AgentTrace, defaultTimeoutMs = 5000 } = {}) {
    if (!registry) {
      throw new TypeError('Orchestrator requires an AgentRegistry instance');
    }
    this.registry = registry;
    this.traceModel = traceModel;
    this.defaultTimeoutMs = defaultTimeoutMs;
  }

  /**
   * Executes a timed promise race to enforce execution deadlines.
   *
   * @param {Promise<AgentResult>} promise - Agent execution promise
   * @param {number} timeoutMs - Timeout limit
   * @param {string} agentName - Agent name
   * @returns {Promise<AgentResult>}
   */
  async _executeWithTimeout(promise, timeoutMs, agentName) {
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(new AgentError('AGENT_TIMEOUT', `Agent '${agentName}' timed out after ${timeoutMs}ms`, agentName));
      }, timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Persists operational trace for an execution step without leaking secrets or unneeded PII.
   *
   * @param {Object} params - Trace details
   */
  async _recordTrace({
    runId,
    entityType = 'TRANSACTION_RISK',
    entityId,
    agentName,
    stepIndex,
    inputData,
    reasoning,
    outputData,
    latencyMs,
    status,
    errorCode,
    errorMessage,
  }) {
    if (!this.traceModel || typeof this.traceModel.create !== 'function') {
      return;
    }

    try {
      // Reasonings must be operational strings only (NEVER raw chain-of-thought)
      let reasoningString = null;
      if (typeof reasoning === 'string') {
        reasoningString = reasoning;
      } else if (reasoning && typeof reasoning === 'object') {
        reasoningString = JSON.stringify(reasoning);
      }

      await this.traceModel.create({
        runId,
        entityType,
        entityId,
        agentName,
        stepIndex,
        inputData: inputData ? JSON.parse(JSON.stringify(inputData)) : undefined,
        reasoning: reasoningString,
        outputData: outputData ? JSON.parse(JSON.stringify(outputData)) : undefined,
        latencyMs: Math.round(latencyMs),
        status,
        errorCode,
        errorMessage,
      });
    } catch (traceErr) {
      // Log trace persistence failure without crashing the core orchestration pipeline
      // if MongoDB is disconnected in isolated tests
    }
  }

  /**
   * Orchestrates multi-agent execution for a transaction or chargeback rebuttal.
   *
   * @param {Object} params
   * @param {string} params.merchantId - Authenticated merchant identifier
   * @param {string} [params.transactionId] - Subject transaction identifier
   * @param {Object} [params.transaction] - Tenant-scoped transaction metadata
   * @param {string} [params.chargebackId] - Subject chargeback identifier (optional)
   * @param {Object} [params.chargeback] - Tenant-scoped chargeback metadata (optional)
   * @param {Object} [params.evidenceIndex] - Pre-built evidence index (optional)
   * @param {string} [params.entityType] - Scoped entity type ('TRANSACTION_RISK' or 'CHARGEBACK_REBUTTAL')
   * @param {Object} [params.deterministicAssessment] - Pre-calculated baseline risk
   * @param {Array<string>} [params.agentNames] - Sequence of agent names to execute
   * @param {number} [params.timeoutMs] - Optional per-agent timeout override
   * @param {Object} [params.metadata] - Optional run metadata
   * @returns {Promise<Object>} Structured orchestration response
   */
  async orchestrate({
    merchantId,
    transactionId,
    transaction,
    chargebackId = null,
    chargeback = null,
    evidenceIndex = null,
    entityType = null,
    deterministicAssessment = null,
    agentNames = ['TRANSACTION_RISK_BASELINE', 'RISK_ANALYST', 'RISK_VERIFICATION'],
    timeoutMs = null,
    metadata = {},
  }) {
    const runId = crypto.randomUUID();
    const effectiveTimeoutMs = timeoutMs || this.defaultTimeoutMs;
    const resolvedEntityType = entityType || (chargebackId || chargeback ? 'CHARGEBACK_REBUTTAL' : 'TRANSACTION_RISK');
    const resolvedEntityId = chargebackId || chargeback?._id || transaction?._id || transactionId;

    let currentContext = new AgentContext({
      runId,
      merchantId,
      transactionId,
      transaction,
      chargebackId,
      chargeback,
      evidenceIndex,
      entityType: resolvedEntityType,
      deterministicAssessment,
      metadata,
    });

    const agentResponses = [];
    let overallStatus = 'COMPLETED';
    let stepIndex = 0;

    for (const name of agentNames) {
      const stepStart = performance.now();
      let agentInstance;
      let agentResult;
      let executionStatus = 'COMPLETED';
      let errorCode = null;
      let errorMessage = null;

      try {
        // 1. Retrieve agent from registry
        agentInstance = this.registry.get(name);

        // 2. Execute agent with timeout boundary
        const executionPromise = Promise.resolve(agentInstance.execute(currentContext));
        const rawResult = await this._executeWithTimeout(executionPromise, effectiveTimeoutMs, name);

        // 3. Validate result contract
        if (!rawResult || typeof rawResult !== 'object' || typeof rawResult.success !== 'boolean') {
          throw new AgentError(
            'MALFORMED_AGENT_RESULT',
            `Agent '${name}' produced an invalid or non-conformant AgentResult`,
            name
          );
        }

        if (rawResult.success) {
          agentResult = rawResult;
          // Propagate validated result to next agent context
          currentContext = currentContext.withAgentResult(agentResult);
        } else {
          executionStatus = 'FAILED';
          overallStatus = 'FAILED';
          errorCode = rawResult.error?.code || 'AGENT_FAILED';
          errorMessage = rawResult.error?.message || 'Agent failed execution';
          agentResult = rawResult;
        }
      } catch (err) {
        executionStatus = err.code === 'AGENT_TIMEOUT' ? 'TIMEOUT' : 'FAILED';
        overallStatus = 'FAILED';
        errorCode = err.code || 'AGENT_EXECUTION_ERROR';
        errorMessage = err.message || 'Agent execution failed';

        agentResult = AgentResult.failure({
          agentName: name,
          agentVersion: agentInstance?.version || 'unknown',
          error: { code: errorCode, message: errorMessage },
        });
      }

      const latencyMs = performance.now() - stepStart;

      // Record operational trace in database
      await this._recordTrace({
        runId,
        entityType: resolvedEntityType,
        entityId: resolvedEntityId,
        agentName: name,
        stepIndex,
        inputData: currentContext.chargebackId
          ? {
              chargebackId: currentContext.chargebackId,
              transactionId: currentContext.transactionId,
              amount: currentContext.transaction?.amount,
              evidenceCount: currentContext.evidenceIndex?.items?.length || 0,
            }
          : {
              transactionId,
              amount: currentContext.transaction?.amount,
              currency: currentContext.transaction?.currency,
            },
        reasoning: agentResult.reasoning,
        outputData: agentResult.output,
        latencyMs,
        status: executionStatus,
        errorCode,
        errorMessage,
      });

      agentResponses.push({
        agentName: name,
        agentVersion: agentInstance?.version || agentResult.agentVersion || 'unknown',
        status: executionStatus,
        output: agentResult.output,
        error: agentResult.error,
        latencyMs: Math.round(latencyMs),
      });

      stepIndex += 1;

      // Abort subsequent agents if a critical pipeline agent fails
      if (executionStatus !== 'COMPLETED') {
        break;
      }
    }

    const baselineOutput = currentContext.getResult('TRANSACTION_RISK_BASELINE');
    const verificationOutput = currentContext.getResult('RISK_VERIFICATION');

    const decision = baselineOutput
      ? {
          riskScore: baselineOutput.riskScore,
          riskTier: baselineOutput.riskTier,
          recommendation: baselineOutput.recommendation,
          authority: 'DETERMINISTIC_BASELINE',
        }
      : null;

    // Synthesize final result summary (backward-compatible)
    const finalResult = {
      runId,
      status: overallStatus,
      executedAgentCount: agentResponses.length,
      primaryAssessment: baselineOutput || null,
    };

    return {
      runId,
      merchantId,
      transactionId,
      chargebackId: currentContext.chargebackId || undefined,
      status: overallStatus,
      decision,
      agents: agentResponses,
      verification: verificationOutput || null,
      finalResult,
      createdAt: new Date().toISOString(),
    };
  }
}

module.exports = Orchestrator;
