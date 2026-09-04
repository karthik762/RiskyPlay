# RiskyPlay

A merchant-facing AI Risk Manager designed to reduce losses from fraud, returns, and chargebacks.

---

## 1. Problem

Modern digital merchants face escalating financial losses from multiple risk vectors:
- **Payment & Identity Fraud**: Account takeovers, stolen credit cards, and credential stuffing resulting in revenue loss and payment processing penalties.
- **Friendly Fraud & Chargeback Abuse**: Customers disputing legitimate purchases claiming non-receipt or unrecognized transactions, exploiting slow merchant rebuttal workflows.
- **Costly Manual Review & Disjointed Evidence**: Merchant fraud teams spend hours compiling tracking numbers, customer communications, and transaction logs across disparate portals, often missing strict chargeback filing deadlines.
- **Customer Friction vs. Loss Tradeoff**: Blunt rule-based fraud filters reject legitimate customers (high false positives), damaging customer lifetime value (LTV) and brand trust.

---

## 2. Product Goal

RiskyPlay provides an intelligent, automated risk management cockpit that:
1. Detects transaction fraud anomalies in real time before fulfillment.
2. Identifies friendly fraud and abusive return patterns.
3. Automatically synthesizes evidence packages and generates network-compliant chargeback rebuttal letters.
4. Orchestrates specialized AI agents to analyze, substantiate, verify, and decide on dispute actions.
5. Balances financial recovery against customer friction via explicit cost-matrix modeling.
6. Provides transparent agent execution traces and human-in-the-loop review controls.

---

## 3. Core Workflow

1. **Transaction Ingestion & Risk Scoring**: Inbound transactions are assessed against both a rule-based baseline and AI risk scoring models. High-risk transactions are flagged with specific anomaly signals.
2. **Alert & Investigation**: Merchant views flagged transactions, behavioral signals (velocity, geolocation mismatch, device intelligence), and recommended actions.
3. **Dispute Ingestion**: When a chargeback or dispute notice is received, RiskyPlay matches the claim against original order and fulfillment data.
4. **Evidence Collection**: The system retrieves delivery confirmation, courier signatures, terms acceptance timestamps, and support logs.
5. **AI Rebuttal Drafting & Verification**: AI agents draft a dispute representment letter customized to card network reason codes, while a QA agent verifies factual accuracy and network compliance.
6. **Human-in-the-Loop Decision**: The merchant reviews the dispute packet, adjusts parameters if desired, and approves representment submission.

---

## 4. Architecture

RiskyPlay uses a decoupled service architecture separating business management from specialized AI reasoning and evaluation.

```
┌────────────────────────────────────────────────────────┐
│               Merchant Web Dashboard                   │
│              (React 19 + Vite 8 + CSS)                 │
└───────────────────────────┬────────────────────────────┘
                            │ REST / JSON (JWT Auth)
                            ▼
┌────────────────────────────────────────────────────────┐
│                Main Backend Gateway                    │
│              (Node.js + Express 5.x)                   │
│   - Merchant Authentication & Session State            │
│   - Transaction & Dispute Lifecycle Management         │
│   - Audit Logs & Human Review Gateways                 │
└─────────────┬────────────────────────────┬─────────────┘
              │                            │
     Mongoose │ Driver                     │ Internal Service HTTP
              ▼                            ▼
┌───────────────────────────┐  ┌─────────────────────────┐
│     MongoDB Database      │  │    Python AI Service    │
│  - merchants              │  │      (FastAPI)          │
│  - transactions           │  │  - Baseline Rule Engine │
│  - riskassessments        │  │  - Multi-Agent Pipeline │
│  - chargebacks            │  └───────────┬─────────────┘
│  - evidence               │              │
│  - agenttraces            │              │ OpenAI-compatible API
│  - auditlogs              │              ▼
└───────────────────────────┘  ┌─────────────────────────┐
                               │   OmniRoute Gateway     │
                               │      (LLM Proxy)        │
                               └───────────┬─────────────┘
                                           │
                                           ▼
                               ┌─────────────────────────┐
                               │  Upstream LLM Providers │
                               │  (Claude, GPT-4o, etc.) │
                               └─────────────────────────┘
```

> **Gateway Distinction**: **OmniRoute** functions as the unified LLM proxy/gateway providing load balancing, routing, and provider abstraction. The domain-specific **RiskyPlay AI agents** (Orchestrator, Risk Analyst, Evidence, Chargeback Response, QA, Decision) live inside the **Python AI Service**, where they coordinate reasoning tasks and dispatch model calls through OmniRoute.

---

## 5. Technology Stack

- **Frontend**: React 19, Vite 8, Vanilla CSS (modular design tokens).
- **Main Backend**: Node.js (v22+), Express 5.x, Mongoose 9.x, MongoDB.
- **AI Intelligence Service**: Python 3.12+, FastAPI, Pydantic, HTTPX.
- **LLM Gateway**: OmniRoute (OpenAI-compatible unified API).
- **Evaluation & Benchmarking**: Python, Scikit-learn, Pandas, NumPy.
- **Development Tooling**: Antigravity IDE, Git, ESLint.

---

## 6. Project Structure

```text
RiskyPlay/
├── client/                 # React frontend application (Vite)
│   ├── src/                # Components, pages, and API clients
│   ├── .env.example        # Frontend environment template
│   └── package.json        # Client dependencies & scripts
├── server/                 # Express backend application
│   ├── src/                # Models, routes, controllers, and services (Planned)
│   ├── .env.example        # Server environment template
│   └── package.json        # Server dependencies & scripts
├── ai-service/             # FastAPI AI agent microservice
│   ├── app/                # Multi-agent pipelines and endpoints (Planned)
│   └── .env.example        # AI service environment template
├── evaluation/             # Model evaluation & benchmarking suite
│   ├── datasets/           # Held-out benchmark datasets (Planned)
│   └── scripts/            # Reproducible metric calculation scripts (Planned)
├── .gitignore              # Repository-wide Git exclusions
└── README.md               # Project documentation
```

---

## 7. Planned AI Agent Architecture

*(Note: The following agents represent planned system architecture to be implemented in upcoming phases.)*

1. **Orchestrator Agent**: Manages session context, pipeline state transitions, task delegation, and agent execution trace logging.
2. **Risk Analyst Agent**: Analyzes transaction signals (card velocity, geolocation jumps, device spoofing, disposable email indicators) to generate anomaly scores and risk hypotheses.
3. **Evidence Agent**: Ingests order details, courier tracking confirmations, customer service messages, and terms-of-service logs to compile an authoritative evidence dossier.
4. **Chargeback Response Agent**: Synthesizes reason codes (e.g. Visa 10.4, Mastercard 4837) and the evidence dossier into a structured, persuasive representment response.
5. **Verification/QA Agent**: Evaluates drafted responses against network rules, flags factual discrepancies or potential model hallucinations, and grades submission readiness.
6. **Decision Agent**: Weighs recovery probability against dispute fees, merchant loss tolerances, and customer lifetime value to recommend final dispute action (Contest, Accept, or Escalate).

---

## 8. Evaluation Strategy

*(Note: The following evaluation framework represents planned functionality to be implemented in Phase 5.)*

To validate risk assessment quality without bias, RiskyPlay will employ a reproducible, held-out evaluation harness:
- **Held-Out Test Dataset**: Labeled transaction dataset containing confirmed legitimate transactions, fraud instances, and friendly fraud disputes.
- **Comparative Baseline**: A deterministic rule-based engine (threshold checks on order amount, shipping/billing address match, velocity) evaluated directly alongside the AI multi-agent pipeline.
- **Core Classification Metrics**:
  - **Precision**: Ratio of accurately flagged fraud to total flagged transactions.
  - **Recall**: Ratio of caught fraud to total actual fraud.
  - **F1 Score**: Harmonic mean of precision and recall.
  - **Accuracy**: Overall classification accuracy.
  - **Confusion Matrix**: Quantitative breakdown of True Positives, False Positives, True Negatives, and False Negatives.
- **Financial Cost Matrix Analysis**:
  - **False Positive Cost**: Margin loss, customer friction, and estimated LTV attrition caused by blocking good buyers.
  - **False Negative Cost**: Chargeback fees ($15–$25 per occurrence), stolen merchandise value, and card network risk monitoring ratios.
  - Objective: Prove measurable net dollar savings of the AI system over static merchant rules.

---

## 9. Local Development

### Prerequisites
- Node.js (v20+ recommended, v22 supported)
- Python (3.12+ recommended)
- MongoDB instance (local service or MongoDB Atlas URI)

### Quick Start (Planned Workflow)

1. **Clone and Configure Environment**:
   ```bash
   git clone https://github.com/karthik762/RiskyPlay.git
   cd RiskyPlay
   ```
   Copy example environment files:
   ```bash
   cp server/.env.example server/.env
   cp client/.env.example client/.env
   cp ai-service/.env.example ai-service/.env
   ```

2. **Run Frontend**:
   ```bash
   cd client
   npm install
   npm run dev
   ```

3. **Run Backend (Once Implemented)**:
   ```bash
   cd server
   npm install
   npm run dev
   ```

4. **Run AI Service (Once Implemented)**:
   ```bash
   cd ai-service
   python -m venv .venv
   source .venv/bin/activate  # or .venv\Scripts\activate on Windows
   pip install -r requirements.txt
   uvicorn app.main:app --reload --port 8000
   ```

---

## 10. Environment Variables

Each subsystem maintains an isolated `.env.example` template:

- `server/.env.example`:
  - `PORT`: Port for Express backend (default: `5000`).
  - `NODE_ENV`: Runtime environment (`development` / `production`).
  - `MONGODB_URI`: MongoDB connection string.
  - `AI_SERVICE_URL`: URL for FastAPI AI service (default: `http://localhost:8000`).
  - `JWT_SECRET`: Signing secret for authentication tokens.
  - `CORS_ORIGIN`: Allowed client origin (default: `http://localhost:5173`).
- `client/.env.example`:
  - `VITE_API_BASE_URL`: Express API endpoint (default: `http://localhost:5000/api/v1`).
- `ai-service/.env.example`:
  - `AI_SERVICE_PORT`: FastAPI listening port (default: `8000`).
  - `OMNIROUTE_BASE_URL`: OmniRoute LLM gateway endpoint (default: `http://localhost:20128/v1`).
  - `OMNIROUTE_API_KEY`: API key for OmniRoute authentication.
  - `OMNIROUTE_MODEL`: Default LLM model identifier.

---

## 11. Git Workflow

- **Active Branch**: Feature branches cut from `setup/project-foundation` or `main`.
- **Commit Hygiene**:
  - Never stage or commit `.env` files, API keys, or local credentials.
  - Never commit `node_modules/`, Python virtual environments (`.venv/`), or build artifacts (`dist/`).
  - Root `.gitignore` enforces cross-language hygiene rules.

---

## 12. Current Development Status

| Phase | Description | Status |
| :--- | :--- | :--- |
| **Phase 1** | Foundation, Git Hygiene & Environment Setup | **In Progress / Current** |
| **Phase 2** | Express Backend & MongoDB Core Implementation | *Planned* |
| **Phase 3** | FastAPI AI Service & Multi-Agent Engine | *Planned* |
| **Phase 4** | React Merchant Dashboard & Interaction UI | *Planned* |
| **Phase 5** | Evaluation Framework & Baseline Cost Benchmarks | *Planned* |
| **Phase 6** | End-to-End Demo Flow & Hackathon Presentation Polish | *Planned* |
