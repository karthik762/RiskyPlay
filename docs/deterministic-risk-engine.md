# Deterministic Transaction Risk Engine (Baseline)

## 1. Overview & Objective

The **Deterministic Transaction Risk Engine** serves as the verifiable, explainable baseline for transaction risk assessment in RiskyPlay. It executes purely rule-based, deterministic scoring without relying on large language models (LLMs) or external machine-learning services. 

Every evaluation is reproducible: given identical transaction input, the engine computes identical risk scores, signals, and recommendations. This baseline establishes a benchmark against which advanced AI risk agents can be evaluated in subsequent phases.

---

## 2. Architecture & Execution Flow

The engine is decoupled into pure computation and transactional persistence:

```
Transaction Request
        │
        ▼
   riskService.assessAndPersistRisk(merchantId, transactionId)
        │
        ├─► Verify tenant ownership: Transaction.findOne({ _id: transactionId, merchantId })
        │
        ├─► riskService.calculateRisk(transaction) (Pure In-Memory Evaluation)
        │         │
        │         ├─► Rule 1: High Transaction Value
        │         ├─► Rule 2: Elevated Transaction Value
        │         ├─► Rule 3: Customer Information Incomplete
        │         ├─► Rule 4: International Issuer (SKIPPED — see Section 3)
        │         ├─► Rule 5: Cart Total Mismatch
        │         └─► Rule 6: Large Item Quantity
        │         │
        │         ├─► Accumulate Points & Clamp: [0, 100]
        │         ├─► Map to Risk Tier: LOW | MEDIUM | HIGH
        │         └─► Map to Recommendation: APPROVE | REVIEW | DECLINE
        │
        └─► Persist to MongoDB: RiskAssessment.create(...)
                  ├─ transactionId
                  ├─ merchantId
                  ├─ riskScore
                  ├─ riskTier
                  ├─ recommendation
                  ├─ signals: [ { code, description, severity, confidence: 1.0 } ]
                  ├─ ruleMatches: [ { rule, points, reason } ]
                  ├─ baselineScore: riskScore
                  └─ aiScore: null
```

---

## 3. Baseline Rules Specification

All rules evaluate solely against fields existing within the `Transaction` schema (`amount`, `customer`, `cartItems`, `paymentMethod`). No external data or speculative fraud claims are introduced.

### Rule 1: High Transaction Value
- **Rule Code**: `HIGH_VALUE_TRANSACTION`
- **Condition**: `transaction.amount >= 1000.00`
- **Points Added**: `+40`
- **Signal Severity**: `HIGH`
- **Confidence**: `1.0` (indicates deterministic rule match confidence, not statistical fraud probability)
- **Reason**: High ticket transactions present inherently elevated exposure to fraudulent chargebacks.

### Rule 2: Elevated Transaction Value
- **Rule Code**: `ELEVATED_TRANSACTION_VALUE`
- **Condition**: `500.00 <= transaction.amount < 1000.00`
- **Points Added**: `+20`
- **Signal Severity**: `MEDIUM`
- **Confidence**: `1.0`
- **Reason**: Transactions above the average basket size warrant elevated scrutiny. Mutually exclusive with Rule 1.

### Rule 3: Customer Information Incomplete
- **Rule Code**: `CUSTOMER_INFORMATION_INCOMPLETE`
- **Condition**: `!customer || !customer.email || customer.email.trim() === ''`
- **Points Added**: `+15`
- **Signal Severity**: `LOW`
- **Confidence**: `1.0`
- **Reason**: Absence of primary contact identity (email) impairs merchant communication and post-purchase dispute resolution. This rule adds modest points and explicitly avoids assuming fraudulent intent.

### Rule 4: International Card Issuer (Documented & Skipped)
- **Status**: `SKIPPED`
- **Rationale**: While `paymentMethod.issuerCountry` exists on the transaction, neither `Transaction` nor `Merchant` specifies the merchant's expected domestic jurisdiction. In compliance with Phase 2H design guidelines, the engine does not fabricate or infer merchant country information. This rule will be enabled once merchant geographic profile metadata is implemented.

### Rule 5: Cart Total Mismatch
- **Rule Code**: `CART_TOTAL_MISMATCH`
- **Condition**: `cartItems.length > 0` AND `|sum(price * quantity) - amount| > 0.01`
- **Points Added**: `+35`
- **Signal Severity**: `HIGH`
- **Confidence**: `1.0`
- **Reason**: A discrepancy between individual line item totals and the declared transaction amount suggests cart tampering, untracked fees, or billing inconsistency.

### Rule 6: Large Item Quantity
- **Rule Code**: `LARGE_ITEM_QUANTITY`
- **Condition**: `cartItems.length > 0` AND any item has `quantity >= 10`
- **Points Added**: `+20`
- **Signal Severity**: `MEDIUM`
- **Confidence**: `1.0`
- **Reason**: Abnormally high individual item quantities can indicate bulk inventory liquidation, reselling abuse, or card testing.

---

## 4. Centralized Configuration Reference

Configuration is managed centrally in `server/src/config/riskConfig.js`:

| Parameter | Type | Default Value | Description |
| :--- | :--- | :--- | :--- |
| `HIGH_VALUE_THRESHOLD` | Number | `1000.00` | Minimum amount for high-value risk points |
| `MEDIUM_VALUE_THRESHOLD` | Number | `500.00` | Minimum amount for elevated risk points |
| `LARGE_ITEM_QUANTITY_THRESHOLD` | Number | `10` | Single-item quantity threshold |
| `CART_MISMATCH_TOLERANCE` | Number | `0.01` | Rounding tolerance between cart sum and transaction amount |
| `HIGH_VALUE_POINTS` | Number | `40` | Points added for Rule 1 |
| `MEDIUM_VALUE_POINTS` | Number | `20` | Points added for Rule 2 |
| `CUSTOMER_INCOMPLETE_POINTS` | Number | `15` | Points added for Rule 3 |
| `CART_MISMATCH_POINTS` | Number | `35` | Points added for Rule 5 |
| `LARGE_ITEM_QUANTITY_POINTS` | Number | `20` | Points added for Rule 6 |

---

## 5. Score Calculation, Tiers & Recommendations

### Calculation
1. Initial score begins at `0`.
2. Each applicable rule evaluates against the transaction; triggered rules append their points to `rawScore`.
3. The final score is clamped:
   $$\text{riskScore} = \min(100, \max(0, \text{round}(\text{rawScore})))$$

### Risk Tiers & Recommendations

| Tier | Score Range | Default Recommendation | Description |
| :--- | :--- | :--- | :--- |
| **LOW** | `0 – 29` | `APPROVE` | Standard transaction with low indicators of risk. Safe for automated fulfillment. |
| **MEDIUM** | `30 – 69` | `REVIEW` | Elevated risk indicators present (e.g., cart mismatch, elevated value). Sent to manual review. |
| **HIGH** | `70 – 100` | `DECLINE` | Severe risk indicators (e.g., high value combined with cart mismatch and bulk quantity). |

---

## 6. Tenant Isolation & Security

- **Identity Sourcing**: The authenticated merchant identity is derived solely from `req.user.merchantId` via verified JWT. Client request bodies, parameters, and query strings are never trusted for ownership.
- **Query Scoping**:
  - `POST /api/v1/transactions/:id/risk` verifies transaction ownership with `{ _id: id, merchantId }`.
  - `GET /api/v1/transactions/:id/risk` first verifies transaction ownership with `{ _id: id, merchantId }`.
  - Attempting to assess or retrieve another merchant's transaction yields an indistinguishable `404 TRANSACTION_NOT_FOUND` to prevent metadata leakage.

---

## 7. Duplicate / Re-run Execution Policy

When `POST /api/v1/transactions/:id/risk` is called multiple times on the same transaction:
- A new `RiskAssessment` document is created with a unique `_id` and timestamp for each execution.
- Historical assessments are preserved immutably.
- `GET /api/v1/transactions/:id/risk` retrieves the latest assessment by querying `{ transactionId }` sorted by `createdAt: -1`.
- **Rationale**: Preserving assessment history enables comparative auditing, backtesting rule changes against prior assessments, and tracking risk profile changes if transaction details are revised.

---

## 8. Limitations of the Baseline

1. **No Behavioral History**: Baseline scoring operates strictly on single-transaction payloads. It does not measure merchant velocity, card frequency, or cross-transaction device linkage.
2. **Fixed Weighting**: Rules use fixed additive points rather than calibrated non-linear probabilities.
3. **No Unsupervised Anomaly Detection**: Unprecedented patterns outside explicit rule boundaries are not flagged.
4. **No LLM Synthesizer**: Explanations are templated rather than dynamically synthesized from complex multi-source signals.

*These limitations establish the foundation for future AI-driven risk scoring phases.*
