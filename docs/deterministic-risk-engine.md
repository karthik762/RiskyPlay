# Deterministic Transaction Risk Engine (Baseline)

## 1. Overview & Objective

The **Deterministic Transaction Risk Engine** serves as the verifiable, explainable baseline for transaction risk assessment in RiskyPlay. It executes purely rule-based, deterministic scoring without relying on large language models (LLMs) or external machine-learning services.

Every evaluation is reproducible: given identical transaction input, the engine computes identical risk scores, signals, rule matches, and recommendations. This baseline establishes a measurable benchmark against which advanced AI risk agents can be evaluated in subsequent phases.

---

## 2. Risk Response Contract

The Risk Assessment API exposes a hardened, standardized response contract. All responses strictly exclude internal MongoDB implementation details (e.g., `__v`), secrets, JWTs, and redundant customer PII.

### Success Response Shape (`HTTP 200` / `HTTP 201`)

```json
{
  "success": true,
  "data": {
    "id": "64a1b2c3d4e5f6a7b8c9d0e1",
    "transactionId": "64a1b2c3d4e5f6a7b8c9d001",
    "merchantId": "507f1f77bcf86cd799439011",
    "riskScore": 75,
    "riskTier": "HIGH",
    "recommendation": "DECLINE",
    "baselineScore": 75,
    "aiScore": null,
    "signals": [
      {
        "code": "HIGH_VALUE_TRANSACTION",
        "description": "Transaction amount ($1500.00) exceeds the high-value baseline threshold ($1000.00).",
        "severity": "HIGH",
        "confidence": 1.0
      },
      {
        "code": "CART_TOTAL_MISMATCH",
        "description": "Calculated cart total ($100.00) differs from transaction amount ($1500.00).",
        "severity": "HIGH",
        "confidence": 1.0
      }
    ],
    "ruleMatches": [
      {
        "rule": "HIGH_VALUE_TRANSACTION",
        "points": 40,
        "reason": "Transaction amount ($1500.00) meets or exceeds high-value threshold of $1000.00."
      },
      {
        "rule": "CART_TOTAL_MISMATCH",
        "points": 35,
        "reason": "Calculated cart total ($100.00) does not match transaction amount ($1500.00) within $0.01 tolerance."
      }
    ],
    "createdAt": "2026-09-05T12:00:00.000Z"
  }
}
```

> [!NOTE]
> **aiScore Specification**: The `aiScore` property is explicitly set to `null` across all baseline risk assessments. It will be populated only when downstream AI agent pipelines are activated.

---

## 3. Explainability & Zero-Risk Guarantees

### Structured Explainability
Every non-zero risk score is mathematically and logically accounted for:
$$\text{riskScore} = \min\left(100, \sum \text{ruleMatch.points}\right)$$

Every triggered rule contributes an auditable pair:
1. **Signal**: Code, human-readable description, severity (`LOW` | `MEDIUM` | `HIGH`), and rule confidence (`1.0`).
2. **RuleMatch**: Exact rule code, numerical points added, and triggering rationale.

No vague explanations ("AI thinks this is suspicious") or hidden chain-of-thought tokens are permitted.

### Zero-Risk Transactions
A transaction that triggers no risk rules (e.g., standard basket value, verified customer email, matching cart items) produces an unpenalized assessment:
- `riskScore`: `0`
- `riskTier`: `LOW`
- `recommendation`: `APPROVE`
- `baselineScore`: `0`
- `aiScore`: `null`
- `signals`: `[]`
- `ruleMatches`: `[]`

---

## 4. Input Immutability & Defensive Hardening

### Strict Immutability
The deterministic risk engine treats the incoming transaction payload as strictly read-only:
- In-memory calculation (`calculateRisk`) executes without mutating `transaction`, `customer`, or `cartItems`.
- Enables subsequent downstream pipelines and agents to inspect the unaltered transaction.

### Numeric Hardening & Non-Finite Numbers
- Amounts with non-finite values (`NaN`, `Infinity`, `-Infinity`) or negative quantities are rejected defensively from point-generating rules, preventing arithmetic corruption.
- Floating-point discrepancies in cart sums are rounded to 4 decimal places before comparing against `CART_MISMATCH_TOLERANCE` (`0.01`), preventing binary floating-point representation artifacts (e.g., `0.010000000000000009`) from generating false-positive mismatches.

---

## 5. Baseline Rules & Exact Boundaries

All rules evaluate solely against fields existing within the `Transaction` schema (`amount`, `customer`, `cartItems`, `paymentMethod`).

| Rule Code | Exact Trigger Boundary | Points | Severity | Confidence |
| :--- | :--- | :--- | :--- | :--- |
| `HIGH_VALUE_TRANSACTION` | `amount >= 1000.00` ($999.99 does not trigger; $1000.00 triggers) | `+40` | `HIGH` | `1.0` |
| `ELEVATED_TRANSACTION_VALUE` | `500.00 <= amount < 1000.00` ($499.99 does not trigger; $500.00 triggers) | `+20` | `MEDIUM` | `1.0` |
| `CUSTOMER_INFORMATION_INCOMPLETE` | `!customer` OR missing/empty/whitespace `customer.email` | `+15` | `LOW` | `1.0` |
| `INTERNATIONAL_ISSUER` | **SKIPPED**: Neither `Transaction` nor `Merchant` specifies domestic merchant country. Documented rationale without assuming data. | `0` | N/A | N/A |
| `CART_TOTAL_MISMATCH` | `cartItems.length > 0` AND `\|cartTotal - amount\| > 0.01` ($0.01 difference does not trigger; $0.02 difference triggers) | `+35` | `HIGH` | `1.0` |
| `LARGE_ITEM_QUANTITY` | `cartItems.length > 0` AND any item `quantity >= 10` (quantity 9 does not trigger; 10 triggers) | `+20` | `MEDIUM` | `1.0` |

---

## 6. Score Calculation, Tiers & Recommendations

### Calculation
1. Initial score begins at `0`.
2. Each applicable rule adds configured points to `rawScore`.
3. Clamped:
   $$\text{riskScore} = \min(100, \max(0, \text{round}(\text{rawScore})))$$

### Risk Tiers & Recommendations

| Tier | Score Range | Default Recommendation | Description |
| :--- | :--- | :--- | :--- |
| **LOW** | `0 – 29` | `APPROVE` | Standard low-risk transaction. Safe for automated fulfillment. |
| **MEDIUM** | `30 – 69` | `REVIEW` | Elevated risk indicators present. Routed to manual review queue. |
| **HIGH** | `70 – 100` | `DECLINE` | Severe risk indicators. Automated decline recommended. |

---

## 7. Service-Level Data Consistency Invariants

To guarantee database integrity, `riskService` enforces invariants before any `RiskAssessment` document is persisted:
1. `riskScore` must be an integer between 0 and 100.
2. `riskTier` must match the configured threshold boundaries for `riskScore`.
3. `recommendation` must match the mapped recommendation for `riskTier`.
4. `baselineScore` must strictly equal `riskScore`.
5. `aiScore` must remain strictly `null`.

If any invariant fails, an `INTERNAL_INVARIANT_ERROR` is thrown, preventing inconsistent state from reaching MongoDB.

---

## 8. Assessment History Policy

When `POST /api/v1/transactions/:id/risk` is called multiple times on the same transaction:
- A new, immutable `RiskAssessment` document is created with a unique `id` and timestamp.
- Prior historical assessments are permanently retained.
- `GET /api/v1/transactions/:id/risk` retrieves the latest assessment by querying `{ transactionId }` sorted by `createdAt: -1`.
- **Purpose**: Preserves full audit history for model comparison, policy adjustments, and post-incident investigation.

---

## 9. Tenant Isolation Guarantees

- **Identity Derivation**: Authenticated `merchantId` is derived exclusively from `req.user.merchantId` via verified JWT.
- **Strict Query Scoping**:
  - `POST /api/v1/transactions/:id/risk` verifies transaction ownership with `{ _id: id, merchantId }`.
  - `GET /api/v1/transactions/:id/risk` verifies transaction ownership with `{ _id: id, merchantId }`.
- **Zero Existence Leakage**: If Merchant B queries or attempts to assess Merchant A's transaction, the API returns `404 TRANSACTION_NOT_FOUND`, disclosing no metadata about transaction existence.
- No direct endpoint exists to look up a `RiskAssessment` by its internal assessment ID alone without verifying transaction ownership.

---

## 10. Limitations of the Baseline

1. **Single-Transaction Scope**: Operates only on single transaction payloads without cross-transaction velocity or card frequency analysis.
2. **Fixed Point Weighting**: Rules use fixed additive weights rather than non-linear probabilistic modeling.
3. **Absence of AI Layer**: Nuanced textual or behavioral anomaly detection is reserved for future AI risk agents (`aiScore` remains `null`).
