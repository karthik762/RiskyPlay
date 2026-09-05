# Multi-Agent Orchestration Architecture (Phase 2K)

## 1. Executive Summary & Design Principles

RiskyPlay's multi-agent orchestration layer provides a modular, production-grade foundation for coordinated risk analysis and evidence gathering. The architecture enforces a strict **defense-only** posture designed for automated compliance, fraud detection, and explainable decisioning.

### Core Architectural Guarantees

1. **Defense-Only Execution**:
   - Agents possess **zero** offensive capabilities.
   - Agents cannot execute refunds, account bans, chargeback submissions, or arbitrary financial transactions.
   - Agents cannot execute shell commands, perform unrestricted network calls, or perform arbitrary database mutations.
2. **Deterministic Risk Authority**:
   - The deterministic risk engine (`riskService.js`) remains the baseline authority for transaction scoring and recommendation rules.
   - AI analysts and specialized agents inform, explain, and contextualize risk without bypassing deterministic guardrails.
3. **Strict Tenant Isolation**:
   - Merchant identity (`merchantId`) is derived solely from verified JWT credentials (`req.user.merchantId`).
   - Tenant boundaries are strictly validated on every transaction lookup before agent orchestration begins.
   - Cross-tenant requests produce HTTP `404 Not Found` without disclosing transaction existence.
4. **Prohibition of Chain-of-Thought Scratchpads**:
   - Agents are explicitly forbidden from exposing or persisting hidden scratchpads, internal tokens, or speculative ungrounded reasoning.
   - Trace logs store only structured operational reasoning (`ruleEvaluated`, `evidenceConsidered`, `decisionProduced`).
5. **Fail-Safe Isolation & Immutability**:
   - Agent inputs (`AgentContext`) and outputs (`AgentResult`) are deeply frozen with `Object.freeze()` to prevent post-execution tampering.
   - Sensitive payment artifacts (CVV, full PAN, password hashes, JWT tokens) are stripped from context upon instantiation.
   - Individual agent failures or timeouts are isolated and recorded without crashing the application server.

---

## 2. Core Architectural Components

The orchestrator foundation resides in `server/src/agents/` and comprises the following components:

```
server/src/agents/
├── index.js                          # Module entrypoint & default instances
├── core/
│   ├── Agent.js                      # Abstract base agent class
│   ├── AgentContext.js               # Tenant-scoped immutable context
│   ├── AgentError.js                 # Domain-specific error class
│   ├── AgentRegistry.js              # In-memory agent registry
│   ├── AgentResult.js                # Standardized immutable output envelope
│   └── Orchestrator.js               # Sequential pipeline runner with timeouts & traces
├── tools/
│   └── Tool.js                       # Abstract tool base with validation boundaries
└── agents/
    └── TransactionRiskBaselineAgent.js # Demonstration agent consuming deterministic baseline
```

### Component Breakdown

#### `Agent` (`server/src/agents/core/Agent.js`)
Abstract base class defining the agent lifecycle contract:
- Enforces non-empty `name`, `version`, and `description`.
- Requires implementation of `async execute(context)`.
- Validates that `context` is an instance of `AgentContext`.
- Validates that execution produces a conformant `AgentResult`.

#### `AgentResult` (`server/src/agents/core/AgentResult.js`)
Defines the uniform execution output structure:
- `success`: Boolean indicator.
- `agentName` & `agentVersion`: Originating agent identity.
- `output`: Agent-specific structured output (deeply frozen).
- `error`: Error details (`code`, `message`) if `success` is false.
- `reasoning`: Operational reasoning object (`ruleEvaluated`, `evidenceConsidered`, `decisionProduced`).
- Static factories: `AgentResult.success(...)` and `AgentResult.failure(...)`.

#### `AgentContext` (`server/src/agents/core/AgentContext.js`)
Provides the immutable execution boundary for each pipeline step:
- Stores `runId`, `merchantId`, `transactionId`, `transaction`, `deterministicAssessment`, and `metadata`.
- Sanitizes transaction objects by stripping sensitive fields: `cvv`, `pan`, `password`, `passwordHash`, `jwtToken`, `secret`.
- Deeply freezes all properties via `Object.freeze()` to prevent mutation by downstream agents.
- Provides `getResult(agentName)` and `hasResult(agentName)` for inspecting predecessor outputs.
- Provides `withAgentResult(agentResult)` which returns a *new* cloned and frozen context with the added result, preserving historical immutability.

#### `AgentRegistry` (`server/src/agents/core/AgentRegistry.js`)
Thread-safe, in-memory catalog of registered agents:
- `register(agent)`: Registers an `Agent` instance; rejects non-`Agent` objects and duplicate agent names (`AGENT_DUPLICATE_REGISTRATION`).
- `get(name)`: Retrieves agent or throws `AgentError` (`AGENT_NOT_FOUND`).
- `list()`: Returns metadata summaries of all registered agents.
- `has(name)`, `unregister(name)`, `clear()`.

#### `Tool` (`server/src/agents/tools/Tool.js`)
Safe abstraction for agent utility actions:
- Enforces strict input validation before execution.
- Validates output structure against contract.
- Catches errors and wraps them in `AgentError('TOOL_EXECUTION_ERROR')`.
- Ensures zero direct OS shell, filesystem, or raw database mutation access.

#### `Orchestrator` (`server/src/agents/core/Orchestrator.js`)
Manages sequential pipeline execution:
- Generates a cryptographically random `runId` (UUID v4) for every run.
- Enforces per-agent timeouts using `Promise.race()` (default: 5,000ms).
- Records step-by-step traces via the `AgentTrace` Mongoose model.
- Automatically halts downstream execution if a critical agent fails.
- Returns a structured execution report including per-agent metrics, latency, and synthesized final outcome.

---

## 3. Demonstration Agent: `TransactionRiskBaselineAgent`

Located in `server/src/agents/agents/TransactionRiskBaselineAgent.js`:
- Demonstrates agent orchestration by wrapping the existing Phase 2H/2I deterministic risk engine.
- Reuses `riskService.calculateRisk()` directly without duplicating rule evaluation logic.
- Emits structured metrics: `riskScore`, `riskTier`, `recommendation`, `matchedRules`, `signals`.
- Emits operational reasoning:
  ```json
  {
    "ruleEvaluated": "DETERMINISTIC_BASELINE_RULES",
    "evidenceConsidered": "Transaction amount 1500 USD with 2 rule matches",
    "decisionProduced": "HIGH risk tier (80/100) recommending DECLINE"
  }
  ```

---

## 4. Operational Trace Model (`AgentTrace`)

Every agent execution step is logged to MongoDB in the `AgentTrace` collection (`server/src/models/AgentTrace.js`).

### Schema Fields

| Field | Type | Description |
|---|---|---|
| `runId` | String (UUID) | Unique execution identifier linking all steps in a pipeline run |
| `entityType` | Enum | Target entity (`TRANSACTION_RISK`, `CHARGEBACK_REBUTTAL`) |
| `entityId` | ObjectId | Reference to the subject transaction or chargeback |
| `agentName` | Enum | Agent identifier (`TRANSACTION_RISK_BASELINE`, `ORCHESTRATOR`, etc.) |
| `stepIndex` | Number | Zero-indexed execution sequence number |
| `status` | Enum | Execution outcome: `COMPLETED`, `FAILED`, `TIMEOUT` |
| `latencyMs` | Number | Execution duration in milliseconds |
| `reasoning` | String | Serialized operational reasoning (no private CoT) |
| `inputData` | Object | Sanitized parameters supplied to the agent |
| `outputData` | Object | Validated structured result produced by the agent |
| `errorCode` | String | Machine-readable error code on failure |
| `errorMessage`| String | Human-readable failure description |

---

## 5. API Reference

### Orchestrate Transaction Risk

Executes the multi-agent orchestration pipeline for a specific transaction.

```http
POST /api/v1/transactions/:id/risk/orchestrate
```

#### Authentication
Requires valid Merchant Bearer JWT token in the `Authorization` header:
```
Authorization: Bearer <jwt_access_token>
```

#### Path Parameters
- `id` (string, required): Valid 24-character hexadecimal MongoDB ObjectId of the transaction.

#### Status Codes
- `200 OK`: Pipeline completed successfully.
- `400 Bad Request`: Invalid transaction ID format.
- `401 Unauthorized`: Missing or invalid JWT token.
- `404 Not Found`: Transaction not found or belongs to a different merchant (tenant isolation).

#### Example Response (HTTP 200)

```json
{
  "success": true,
  "data": {
    "runId": "3b29c914-1cb6-4fb4-bf83-82084e8243be",
    "merchantId": "507f1f77bcf86cd799439011",
    "transactionId": "64a1b2c3d4e5f6a7b8c9d001",
    "status": "COMPLETED",
    "agents": [
      {
        "agentName": "TRANSACTION_RISK_BASELINE",
        "agentVersion": "1.0.0",
        "status": "COMPLETED",
        "output": {
          "riskScore": 80,
          "riskTier": "HIGH",
          "recommendation": "DECLINE",
          "signalsCount": 2,
          "matchedRulesCount": 2,
          "matchedRules": [
            {
              "ruleId": "HIGH_VALUE_TRANSACTION",
              "ruleName": "High Transaction Value",
              "score": 40,
              "reason": "Transaction amount ($1500.00) meets or exceeds high-value threshold of $1000.00."
            },
            {
              "ruleId": "CART_TOTAL_MISMATCH",
              "ruleName": "Cart Total Mismatch",
              "score": 40,
              "reason": "Cart sum ($100.00) does not match transaction amount ($1500.00)."
            }
          ],
          "signals": [
            {
              "signalId": "HIGH_VALUE_TRANSACTION",
              "severity": "HIGH",
              "description": "Transaction amount ($1500.00) exceeds the high-value baseline threshold ($1000.00)."
            },
            {
              "signalId": "CART_TOTAL_MISMATCH",
              "severity": "MEDIUM",
              "description": "Cart items total ($100.00) does not match transaction amount ($1500.00)."
            }
          ]
        },
        "error": null,
        "latencyMs": 8
      }
    ],
    "finalResult": {
      "runId": "3b29c914-1cb6-4fb4-bf83-82084e8243be",
      "status": "COMPLETED",
      "executedAgentCount": 1,
      "primaryAssessment": {
        "riskScore": 80,
        "riskTier": "HIGH",
        "recommendation": "DECLINE",
        "signalsCount": 2,
        "matchedRulesCount": 2,
        "matchedRules": [ ... ],
        "signals": [ ... ]
      }
    },
    "createdAt": "2026-09-05T13:30:00.000Z"
  }
}
```

---

## 6. Verification & Test Coverage

The multi-agent orchestration architecture is validated by automated test suites spanning unit, contract, and integration layers:

1. **Unit & Contract Suite (`server/tests/agentOrchestrator.unit.test.js`)**:
   - 23 tests covering `Agent`, `AgentResult`, `AgentContext`, `AgentRegistry`, `Tool`, `TransactionRiskBaselineAgent`, and `Orchestrator`.
   - Validates immutability, payment secret sanitization, duplicate rejection, error propagation, and timeout enforcement.
2. **API & MongoDB Integration Suite (`server/tests/orchestratorApi.test.js`)**:
   - 7 tests covering HTTP authentication, input validation, tenant isolation (Merchant B 404 on Merchant A tx), and live `AgentTrace` persistence.
   - Verifies operational reasoning storage without PII or internal scratchpads.
