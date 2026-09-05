# RiskyPlay — Defensive AI Merchant Risk & Chargeback Platform

> **AI-assisted, defense-only merchant-loss prevention platform featuring grounded multi-agent dispute rebuttals, deterministic risk scoring, and zero-hallucination verification guardrails.**

---

## 1. Executive Summary

Modern merchants lose billions annually to payment fraud and abusive chargebacks. Traditional fraud tools suffer from two major failure modes:
1. **High False Positive Friction**: Blunt rules decline good customers, destroying lifetime value.
2. **Slow, Fragmented Dispute Operations**: Fraud teams spend hours manually hunting courier tracking numbers and customer chat logs across disparate systems, often missing strict 14-day bank rebuttal deadlines.

**RiskyPlay** solves this through a **defense-only multi-agent architecture**:
- **Authoritative Deterministic Risk Engine**: 0–100 mathematical scoring is the sole financial authority. AI cannot silently override or block approved transactions.
- **Evidence Vault Intelligence**: Carrier delivery receipts with direct signatures, GPS coordinates, customer support transcripts, and terms clickwraps are indexed as immutable grounding anchors.
- **Automated Grounded Rebuttals**: AI agents draft card-network compliant representment letters citing verified Evidence Vault IDs.
- **Deterministic Verification Guardrail**: 100% of cited evidence citations are validated before persistence. Speculative accusations ("the customer is lying") and outcome guarantees ("guaranteed win") are deterministically rejected.
- **Zero Autonomous Destructive Actions**: No autonomous dispute submission, no refunds, and no customer bans without explicit merchant review.

---

## 2. Quick Demo Access & Seed Data

### Pre-Seeded Demo Merchant Credentials
The database comes with pre-seeded demo records for immediate review:

| Key | Demo Value |
| :--- | :--- |
| **Merchant Name** | `Apex Digital Hardware Store` |
| **Email** | `demo@riskyplay.com` |
| **Password** | `DemoPassword123!` |
| **Instant Access** | Click **"⚡ Instant Demo Access"** on the login page to auto-fill |

### Seeded Showcase Case (`CB-2026-8891`)
- **Category**: Visa Reason Code 10.4 (Fraud - Cardholder Does Not Recognize)
- **Disputed Amount**: `$1,249.99 USD` (Pro Studio Display + Thunderbolt Dock)
- **Attached Evidence Vault Items**:
  1. `ORDER`: Order Confirmation & Receipt (AVS Street + Zip match, IP: 198.51.100.42)
  2. `DELIVERY`: FedEx Priority POD (Tracking `FDX-9928172901`, direct signature `M. Vance`, GPS coordinate match)
  3. `COMMUNICATION`: Customer Support Chat Ticket (`TCK-88419` confirming delivery and asking for dock drivers)
  4. `CUSTOMER`: Electronic Clickwrap Terms Acceptance with SHA-256 consent hash
- **AI Rebuttal Letter**: Structured representment notice citing exact Evidence IDs
- **Verification Result**: `VERIFIED` (100% grounded citations, 0 warnings, 94% defensive confidence)
- **Authoritative Decision**: `REPRESENT`

---

## 3. Architecture Overview

RiskyPlay separates business operations from advisory AI reasoning:

```
               ┌──────────────────────────────────────────────┐
               │            MERCHANT DASHBOARD                │
               │   React 19 + Vite 8 (Dark Glassmorphism)     │
               └──────────────────────┬───────────────────────┘
                                      │ REST / JSON (JWT)
                                      ▼
               ┌──────────────────────────────────────────────┐
               │         NODE.JS EXPRESS ORCHESTRATOR         │
               │  - Merchant Auth & Multi-Tenant Isolation    │
               │  - Evidence Vault Intelligence               │
               │  - Deterministic Verification Guardrails     │
               │  - Observability Trace Logging               │
               └──────────────┬───────────────────────────────┘
                              │
            ┌─────────────────┴─────────────────┐
            ▼                                   ▼
┌───────────────────────────────┐   ┌───────────────────────────────┐
│     AUTHORITATIVE ENGINE      │   │     ADVISORY AI SERVICE       │
│  - Deterministic Risk Engine  │   │  - Python 3.14 + FastAPI      │
│  - 0–100 Threshold Engine     │   │  - OmniRoute / OpenAI Gateway │
│  - Rule Scoring Matrix        │   │  - Structured Pydantic V2     │
│  - Sole Financial Authority   │   │  - Advisory Summaries Only    │
└───────────────────────────────┘   └───────────────────────────────┘
```

---

## 4. Multi-Agent Pipeline

### A. Transaction Risk Workflow
```
[Inbound Transaction]
       │
       ▼
1. TRANSACTION_RISK_BASELINE Agent (Deterministic rules: value tier, velocity, address match)
       │
       ▼
2. RISK_ANALYST Agent (Advisory LLM analysis with PII minimization)
       │
       ▼
3. RISK_VERIFICATION Agent (Deterministic agreement check & threshold guardrail)
       │
       ▼
[Persisted RiskAssessment & AgentTrace]
```

### B. Chargeback Defense Workflow
```
[Dispute Received]
       │
       ▼
1. EVIDENCE Agent (Indexes Vault artifacts, extracts factual anchors: tracking, signature, GPS)
       │
       ▼
2. CHARGEBACK_RESPONSE Agent (Generates formal rebuttal citing specific Evidence IDs)
       │
       ▼
3. CHARGEBACK_RESPONSE_VERIFICATION Agent (Deterministic guardrail: 0 hallucinated IDs, 0 ungrounded claims)
       │
       ▼
4. CHARGEBACK_DECISION Agent (Authoritative verdict: REPRESENT vs ACCEPT_LOSS)
```

---

## 5. Evaluation Benchmark & Financial Loss Economics

RiskyPlay includes an independent evaluation suite (`evaluation/`) that benchmarks the risk engine across **150 labeled synthetic test cases**:

### Benchmark Performance
- **Total Cases**: 150 (70 APPROVE, 45 REVIEW, 35 DECLINE)
- **Approve Precision**: `80.0%` (Protects merchant checkout conversion)
- **Critical False Negatives**: Only 2 cases (5.7%)
- **Financial Loss Model**:
  - False Positive Cost: `$15.00` (friction & review overhead)
  - False Negative Cost: `$125.00` (chargeback loss & network fees)
  - Unmanaged Baseline Loss: `$4,375.00`
  - RiskyPlay Managed Loss: `$2,875.00`
  - **Net Merchant Savings**: **+$1,500.00 USD** (34.3% loss reduction)

To run the evaluation benchmark:
```bash
npm run evaluate
```

---

## 6. Getting Started & Running Locally

### Prerequisites
- Node.js 20+
- Python 3.11+
- Local MongoDB running on `mongodb://127.0.0.1:27017`

### 1. Seed Demo Database
Populate the demo merchant, realistic transactions across all risk tiers, dispute cases, Vault evidence, and multi-agent traces:
```bash
npm run seed
```

### 2. Start the Backend Server (Port 5000)
```bash
npm run dev:server
```

### 3. Start the Python AI Service (Port 8000, Optional for LLM Live Generation)
```bash
cd ai-service
.\.venv\Scripts\activate
uvicorn app.main:app --port 8000 --reload
```
*(Note: RiskyPlay gracefully degrades with zero downtime if the AI service is offline. Deterministic risk scoring and cached verification proceed normally.)*

### 4. Start the Merchant Frontend Dashboard (Port 5173)
```bash
npm run dev:client
```
Open [http://localhost:5173](http://localhost:5173) in your browser. Click **"⚡ Instant Demo Access"** to sign in.

---

## 7. Test Suites

### Backend Unit & Integration Tests (227 tests, 78 suites)
```bash
npm run test:server
```

### AI Service Tests (27 tests)
```bash
cd ai-service
.\.venv\Scripts\python.exe -m pytest
```

### Frontend Production Build
```bash
npm run test:client
```

---

## 8. License
ISC License • RiskyPlay Team 2026.
