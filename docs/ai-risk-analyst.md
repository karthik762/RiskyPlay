# Phase 2J — AI Risk Analyst Foundation

## 1. Overview & Architecture

The **AI Risk Analyst** represents the first AI-assisted risk evaluation layer in RiskyPlay. It supplements the deterministic baseline risk engine (implemented in Phase 2H/2I) with flexible, nuanced reasoning powered by large language models (via OmniRoute / OpenAI-compatible gateway).

```
+-------------------+             +-----------------------+             +---------------------------+
|  Node.js Backend  |  (REST)     |  Python AI Service    |  (REST)     |  OmniRoute / LLM Gateway  |
|  (Express, Mongoose) ---------> |  (FastAPI, Pydantic)  | ----------> |  (/chat/completions)      |
|                   |  4s timeout |                       | 15s timeout |                           |
+-------------------+             +-----------------------+             +---------------------------+
         |                                    |
         v                                    v
Persists Baseline + AI                Validates Schema &
with Invariant Checks                 Enforces Score-Tier Consistency
```

### Architectural Principles
1. **Independent Evaluation**: The deterministic baseline risk engine calculates canonical baseline metrics (`riskScore`, `baselineScore`, `signals`, `ruleMatches`) in-memory with zero network dependencies.
2. **Supplemental AI Intelligence**: The Python AI service evaluates the transaction and baseline evidence, producing an `aiScore`, `riskTier`, `recommendation`, `riskFactors`, and executive `summary`.
3. **Graceful Degradation**: If the AI service, OmniRoute gateway, or network times out or fails, the core payment processing and assessment pipeline **never breaks**. It safely falls back to the deterministic baseline with `aiScore: null` and records `aiAnalysis.status: 'UNAVAILABLE'`.
4. **Strict Tenant Isolation**: All transaction lookups and assessments require authenticated merchant credentials and enforce ownership boundaries.

---

## 2. Service Contracts & Schemas

### Endpoint: `POST /api/v1/analyze/risk` (Python AI Service)

#### Request Payload
```json
{
  "transaction": {
    "id": "64e0f0000000000000000001",
    "externalTransactionId": "TX-10023",
    "amount": 1499.99,
    "currency": "USD",
    "status": "MANUAL_REVIEW",
    "customer": {
      "email": "c***r@example.com",
      "customerId": "CUST-9921"
    },
    "paymentMethod": {
      "cardBin": "411111",
      "cardLast4": "1111",
      "cardType": "VISA",
      "issuerCountry": "US"
    },
    "cartItems": [
      {
        "productId": "PROD-1",
        "title": "High-End Electronics",
        "price": 1499.99,
        "quantity": 1,
        "category": "electronics"
      }
    ]
  },
  "baseline": {
    "riskScore": 75,
    "riskTier": "HIGH",
    "recommendation": "DECLINE",
    "signals": [
      {
        "code": "HIGH_VALUE_TRANSACTION",
        "description": "Transaction amount exceeds high-value threshold ($1000.00)",
        "severity": "HIGH",
        "confidence": 0.95
      }
    ],
    "ruleMatches": [
      {
        "rule": "HIGH_VALUE",
        "points": 50,
        "reason": "Transaction amount $1499.99 exceeds threshold $1000"
      }
    ]
  }
}
```

#### Response Contract (Strict JSON)

> **Illustrative runtime example — actual risk factors are generated from supplied transaction/baseline evidence and are not fixed enumerations.**

```json
{
  "aiScore": 72,
  "riskTier": "HIGH",
  "recommendation": "DECLINE",
  "riskFactors": [
    {
      "code": "ELEVATED_PURCHASE_VALUE",
      "description": "Single high-value item with elevated purchase price exceeding baseline threshold",
      "severity": "HIGH"
    }
  ],
  "summary": "AI analyst evaluated baseline high-value signals and identified high risk due to transaction amount."
}
```

### Consistency Invariants & Score Semantics
1. **Heuristic Risk Score, Not a Probability**: `aiScore` is an integer heuristic score from 0 to 100 representing relative risk severity. It is **NOT** a calibrated statistical probability.
2. **Deterministic Baseline Canonical Authority**: The deterministic `riskScore` remains the canonical decision score for transactions.
3. **Resilient Fallback**: Complete AI unavailability (network down, gateway timeout, 5xx error, or unparseable output) **never** blocks transaction processing or deterministic risk assessment. The engine falls back to `aiScore: null` and `aiAnalysis.status: 'UNAVAILABLE'` (or `'FAILED'`).
4. `riskTier` must align with score ranges:
   - `0 - 29`: `LOW` (recommendation `APPROVE`)
   - `30 - 69`: `MEDIUM` (recommendation `REVIEW`)
   - `70 - 100`: `HIGH` (recommendation `DECLINE`)
5. Responses failing these rules or containing unexpected/unauthorized properties are rejected at the Pydantic schema validation layer (`extra='forbid'`) before leaving the Python service.

---

## 3. Node.js Storage & Representation

In MongoDB (`RiskAssessment` collection), the document structure retains both deterministic baseline and AI analysis:

```javascript
{
  _id: ObjectId("..."),
  transactionId: ObjectId("..."),
  merchantId: ObjectId("..."),
  riskScore: 75,           // Canonical deterministic decision score (0-100)
  riskTier: "HIGH",        // Canonical deterministic tier
  recommendation: "DECLINE",
  baselineScore: 75,       // Deterministic baseline score
  aiScore: 72,             // AI-assigned heuristic risk score (or null if unavailable)
  aiAnalysis: {
    status: "SUCCESS",     // "SUCCESS" | "UNAVAILABLE" | "FAILED" | "SKIPPED"
    summary: "AI analyst evaluated baseline signals...",
    riskFactors: [
      {
        code: "ELEVATED_PURCHASE_VALUE",
        description: "Single high-value item with elevated purchase price exceeding baseline threshold",
        severity: "HIGH"
      }
    ],
    aiTier: "HIGH",
    aiRecommendation: "DECLINE",
    error: null
  },
  signals: [...],
  ruleMatches: [...],
  createdAt: ISODate("2026-09-05T18:00:00.000Z")
}
```

---

## 4. Prompt Engineering & Negative Directives

The AI system prompt enforces a rigorous, defensive fraud analyst persona:

- **Strict JSON Output**: Must return valid JSON without markdown wrapping or conversational commentary.
- **No Chain-of-Thought**: Raw reasoning chains, internal tags, and scratchpad thoughts are prohibited from leaking into user-facing output.
- **Bounded Hallucinations**: Analysis must strictly cite attributes present in the transaction or deterministic baseline.
- **Explainable Factors**: Outputs structured `riskFactors` with discrete codes and severities, rather than generic freeform text.

---

## 5. Security & Privacy Safeguards

1. **Strict Sanitization**: Before dispatching transaction metadata to the AI service, `sanitizeTransactionForAI()` strips any internal secrets, passwords, tokens, full PAN, and CVV.
2. **Credential Boundary**: OmniRoute API credentials reside solely in the backend Python service environment. Node.js and client applications never receive LLM credentials.
3. **Tenant Scoping**: All assessments enforce merchant tenant ownership via composite queries (`_id` and `merchantId`).

---

## 6. How to Run Locally

### Starting the Python AI Service
```powershell
cd ai-service
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Running Python Tests
```powershell
cd ai-service
.\.venv\Scripts\pytest.exe tests
```

### Running Node Backend Tests
```powershell
cd server
$env:MONGODB_URI = "mongodb://127.0.0.1:27017/riskyplay-test"
npm test
```
