# RiskyPlay Final System Architecture

RiskyPlay is a **defense-only merchant-loss prevention and dispute rebuttal platform**. It pairs modern generative AI capabilities with strict deterministic verification guardrails and mathematical authority.

---

## 1. Core Architectural Tenets

```
               ┌──────────────────────────────────────────────┐
               │         MERCHANT CONTROL PLANE               │
               │   React 19 + Vite Dashboard (Glassmorphic)   │
               └──────────────────────┬───────────────────────┘
                                      │ REST / JSON (JWT)
                                      ▼
               ┌──────────────────────────────────────────────┐
               │         NODE.JS EXPRESS ORCHESTRATOR         │
               │      Auth • Multi-Agent Pipeline • Vault      │
               └──────────────┬───────────────────────────────┘
                              │
            ┌─────────────────┴─────────────────┐
            ▼                                   ▼
┌───────────────────────────────┐   ┌───────────────────────────────┐
│     AUTHORITATIVE ENGINE      │   │     ADVISORY AI SERVICE       │
│  Deterministic Risk Engine    │   │      Python + FastAPI         │
│  Deterministic Guardrails     │   │  OmniRoute / OpenAI Gateway   │
│  Sole Financial & Rule Power  │   │  Zero Autonomous Submissions  │
└───────────────────────────────┘   └───────────────────────────────┘
```

### Key Separation of Concerns
1. **Advisory AI, Authoritative Rules**:
   - The LLM acts purely as an advisory analyst and rebuttal drafter.
   - It **cannot** approve/decline transactions or submit disputes autonomously.
   - The deterministic engine (0–100 score) is the sole financial authority.

2. **Grounded Evidence Vault**:
   - Every dispute claim must resolve to an immutable artifact stored in the `Evidence` vault.
   - Facts extracted from carrier records, invoices, support chats, and terms clickwraps serve as strict grounding anchors.

3. **Deterministic Verification Guardrails**:
   - All AI-generated outputs pass through post-generation verification code before persistence.
   - Any hallucinated evidence citation (referencing non-existent IDs), ungrounded fraud accusation ("cardholder is lying"), or guaranteed-win promise is flagged and sanitized or rejected.

4. **Zero Financial Execution**:
   - The platform never initiates funds movement, customer bans, refunds, or unilateral chargeback submissions without explicit merchant review.

---

## 2. Multi-Agent Pipeline Structure

RiskyPlay operates two primary multi-agent workflows:

### A. Transaction Risk Workflow
1. **`TRANSACTION_RISK_BASELINE` Agent**:
   - Evaluates deterministic baseline rules (value tiers, velocity bursts, address matches, cart discrepancies).
   - Produces authoritative `baselineScore`.
2. **`RISK_ANALYST` Agent**:
   - Receives PII-minimized transaction summary and baseline triggers.
   - Generates advisory summary and structured risk factors.
3. **`RISK_VERIFICATION` Agent**:
   - Evaluates agreement between AI recommendation and deterministic rules.
   - Flags delta anomalies and enforces threshold boundaries.

### B. Chargeback Defense Workflow
1. **`EVIDENCE` Agent**:
   - Indexes all vault artifacts and extracts structured factual anchors (tracking numbers, delivery GPS, signatures, support transcripts).
2. **`CHARGEBACK_RESPONSE` Agent**:
   - Generates structured defense narrative citing specific Evidence Vault IDs.
3. **`CHARGEBACK_RESPONSE_VERIFICATION` Agent**:
   - Deterministically verifies all citations against the active Vault index.
   - Enforces safety invariants (0 ungrounded fraud accusations, 0 outcome promises).
4. **`CHARGEBACK_DECISION` Agent**:
   - Evaluates compelling evidence coverage.
   - Produces authoritative verdict: `REPRESENT` vs `ACCEPT_LOSS`.

---

## 3. High Availability & Graceful Degradation

If the Python AI service or LLM gateway experiences latency or downtime:
- The Node.js orchestrator catches the timeout/connection error gracefully.
- Status is flagged as `AI_UNAVAILABLE`.
- Deterministic scoring proceeds with **zero downtime or disruption**.
- Merchant operations are never blocked by external LLM provider outages.
