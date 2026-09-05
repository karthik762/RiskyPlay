# RiskyPlay Evaluation Benchmark

This directory contains the independent evaluation system for the **RiskyPlay Defensive Merchant Risk Platform**. It benchmarks both the deterministic transaction risk engine and multi-agent risk evaluation pipelines on labeled synthetic and historical transaction test cases.

---

## Benchmark Overview

The evaluation suite evaluates classification precision, recall, confusion matrix distribution, and financial merchant-loss modeling across three primary decision tiers:
1. **APPROVE** (Score: `0–29`, Tier: `LOW`)
2. **REVIEW** (Score: `30–69`, Tier: `MEDIUM`)
3. **DECLINE** (Score: `70–100`, Tier: `HIGH`)

### Financial Loss Model
- **False Positive Cost ($15.00)**: Legitimate transactions mistakenly declined or delayed, resulting in merchant friction, lost customer lifetime value (LTV), and manual review overhead.
- **False Negative Cost ($125.00)**: Fraudulent transactions mistakenly approved, resulting in chargebacks, network dispute fees, and unrecovered merchandise loss.

---

## Directory Structure

- `dataset/`
  - `transactions.json`: 150 ground-truth labeled test transactions encompassing edge cases (velocity bursts, cart discrepancies, geographical distance anomalies, mismatched customer profiles).
- `scripts/`
  - `generate_dataset.js`: Reproducible test generator creating realistic cardholder, transaction, and behavioral profiles with designated expected tiers.
  - `evaluate.js`: Evaluation runner comparing engine verdicts with ground truth and computing statistical metrics and merchant savings models.
- `results/`
  - `metrics.json`: High-level metrics (Accuracy, Macro Precision, Macro Recall, Macro F1, Financial Savings).
  - `confusion-matrix.json`: Detailed 3x3 breakdown of actual vs predicted tiers.
  - `report.md`: Detailed Markdown evaluation report with per-tier performance and business impact analysis.

---

## How to Run

To regenerate the benchmark dataset:
```bash
node evaluation/scripts/generate_dataset.js
```

To run the evaluation and produce updated metrics:
```bash
node evaluation/scripts/evaluate.js
```
