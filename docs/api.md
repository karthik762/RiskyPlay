# RiskyPlay API Documentation

All API endpoints are prefixed with `/api/v1`. Authentication is handled via JSON Web Tokens (JWT) passed in the HTTP `Authorization` header: `Authorization: Bearer <jwt_token>`.

---

## 1. Authentication Endpoints

### Register Merchant
- **`POST /api/v1/auth/register`**
- **Body**:
  ```json
  {
    "name": "Apex Digital Hardware Store",
    "email": "merchant@example.com",
    "password": "Password123!"
  }
  ```
- **Response**: `201 Created` with JWT token and merchant object.

### Login Merchant
- **`POST /api/v1/auth/login`**
- **Body**:
  ```json
  {
    "email": "demo@riskyplay.com",
    "password": "DemoPassword123!"
  }
  ```
- **Response**: `200 OK` with JWT token and merchant object.

### Current Identity
- **`GET /api/v1/auth/me`** (Protected)
- **Response**: `200 OK` with authenticated merchant profile.

---

## 2. Transactions & Deterministic Risk Engine

### List Transactions
- **`GET /api/v1/transactions`** (Protected)
- **Query Params**: `status`, `page`, `limit`
- **Response**: `200 OK` with array of transactions isolated to the authenticated merchant.

### Create Transaction
- **`POST /api/v1/transactions`** (Protected)
- **Body**: Validated transaction payload conforming to `Transaction` schema.

### Get Transaction by ID
- **`GET /api/v1/transactions/:id`** (Protected)

### Assess Transaction Risk
- **`POST /api/v1/transactions/:id/risk`** (Protected)
- **Description**: Executes the deterministic risk engine (0–100 score, Low/Medium/High tier, Approve/Review/Decline recommendation).

### Multi-Agent Transaction Risk Orchestration
- **`POST /api/v1/transactions/:id/risk/orchestrate`** (Protected)
- **Description**: Executes sequential 3-agent defense pipeline:
  1. `TRANSACTION_RISK_BASELINE` (Authoritative deterministic rules)
  2. `RISK_ANALYST` (Advisory LLM analysis with PII minimization)
  3. `RISK_VERIFICATION` (Deterministic verification guardrail)

### Transaction Execution Traces
- **`GET /api/v1/transactions/:id/traces`** (Protected)

---

## 3. Chargeback Defense & Evidence Vault

### List Chargebacks
- **`GET /api/v1/chargebacks`** (Protected)
- **Query Params**: `status`, `page`, `limit`

### Get Chargeback by ID
- **`GET /api/v1/chargebacks/:id`** (Protected)

### Attach Vault Evidence
- **`POST /api/v1/chargebacks/:chargebackId/evidence`** (Protected)
- **Body**:
  ```json
  {
    "type": "DELIVERY",
    "title": "FedEx Direct Signature Proof",
    "description": "Signed by cardholder with GPS coordinate validation",
    "source": "CARRIER",
    "extractedFacts": [
      { "key": "trackingNumber", "value": "FDX-9928172901", "confidence": 1.0, "verified": true },
      { "key": "signedBy", "value": "M. Vance", "confidence": 1.0, "verified": true }
    ]
  }
  ```

### List Case Evidence
- **`GET /api/v1/chargebacks/:chargebackId/evidence`** (Protected)

### Generate Rebuttal Draft
- **`POST /api/v1/chargebacks/:chargebackId/response/generate`** (Protected)
- **Description**: Invokes AI Response agent to draft a defensive rebuttal strictly referencing registered Evidence IDs.

### Verify Rebuttal Draft
- **`POST /api/v1/chargebacks/:chargebackId/response/verify`** (Protected)
- **Description**: Deterministic Verification Guardrail ensuring:
  1. 100% of cited evidence IDs exist in the Evidence Vault
  2. Zero ungrounded fraud assertions
  3. Zero guaranteed-win hallucinated promises

### Chargeback Execution Traces
- **`GET /api/v1/chargebacks/:id/traces`** (Protected)

---

## 4. Merchant Dashboard & Observability

### Merchant Dashboard Statistics
- **`GET /api/v1/dashboard/stats`** (Protected)
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "transactions": { "totalCount": 14, "totalVolume": 11739.47, "approvedCount": 7, "pendingCount": 3, "failedCount": 4 },
      "risk": { "distribution": { "LOW": 7, "MEDIUM": 3, "HIGH": 4 }, "totalAssessed": 14 },
      "chargebacks": { "totalCount": 4, "totalAmount": 2398.99, "winRate": 100, "byStatus": { "OPEN": 1, "UNDER_REVIEW": 2, "WON": 1 } },
      "defenseMetrics": { "potentialLossProtected": 450, "agentTracesCount": 5, "avgLatencyMs": 18 }
    }
  }
  ```

### Global Observability Traces
- **`GET /api/v1/traces`** (Protected)
- **Query Params**: `entityType`, `agentName`, `runId`, `status`, `limit`, `page`
