/**
 * Evaluation script for RiskyPlay transaction-risk classification.
 * Runs deterministic risk engine against the held-out evaluation dataset (150 cases).
 * Calculates standard classification metrics and transparent merchant-loss financial impacts.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { calculateRisk } = require('../../server/src/services/riskService');

const datasetPath = path.join(__dirname, '../dataset/transactions.json');
if (!fs.existsSync(datasetPath)) {
  console.error(`Dataset not found at ${datasetPath}. Run generate_dataset.js first.`);
  process.exit(1);
}

const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf-8'));
const classes = ['APPROVE', 'REVIEW', 'DECLINE'];

// Confusion matrix: row = ground truth, col = predicted
const confusionMatrix = {
  APPROVE: { APPROVE: 0, REVIEW: 0, DECLINE: 0 },
  REVIEW: { APPROVE: 0, REVIEW: 0, DECLINE: 0 },
  DECLINE: { APPROVE: 0, REVIEW: 0, DECLINE: 0 },
};

let correctPredictions = 0;
const resultsLog = [];

// Financial modeling assumptions
const COST_FALSE_POSITIVE = 15.0; // Friction, manual review overhead, potential checkout abandonment
const COST_FALSE_NEGATIVE = 125.0; // Chargeback fee, merchant liability, unrecovered merchandise

let totalLegitimate = 0;
let totalFraudulent = 0;
let falsePositiveCount = 0;
let falseNegativeCount = 0;

for (const item of dataset) {
  const assessment = calculateRisk(item.transaction);
  const predicted = assessment.recommendation;
  const actual = item.groundTruth;

  confusionMatrix[actual][predicted] += 1;

  if (predicted === actual) {
    correctPredictions += 1;
  }

  // Binary fraud alignment:
  // Legitimate: actual === 'APPROVE'
  // Fraudulent/High Risk: actual === 'DECLINE'
  if (actual === 'APPROVE') {
    totalLegitimate += 1;
    if (predicted !== 'APPROVE') {
      falsePositiveCount += 1;
    }
  } else if (actual === 'DECLINE') {
    totalFraudulent += 1;
    if (predicted === 'APPROVE') {
      falseNegativeCount += 1;
    }
  }

  resultsLog.push({
    id: item.id,
    actual,
    predicted,
    score: assessment.riskScore,
    tier: assessment.riskTier,
    matched: predicted === actual,
  });
}

const totalSamples = dataset.length;
const overallAccuracy = correctPredictions / totalSamples;

// Per-class metrics
const perClassMetrics = {};
let sumPrecision = 0;
let sumRecall = 0;
let sumF1 = 0;

for (const c of classes) {
  const tp = confusionMatrix[c][c];
  let fp = 0;
  let fn = 0;

  for (const other of classes) {
    if (other !== c) {
      fp += confusionMatrix[other][c];
      fn += confusionMatrix[c][other];
    }
  }

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  sumPrecision += precision;
  sumRecall += recall;
  sumF1 += f1;

  perClassMetrics[c] = {
    truePositives: tp,
    falsePositives: fp,
    falseNegatives: fn,
    precision: parseFloat(precision.toFixed(4)),
    recall: parseFloat(recall.toFixed(4)),
    f1Score: parseFloat(f1.toFixed(4)),
  };
}

const macroPrecision = parseFloat((sumPrecision / classes.length).toFixed(4));
const macroRecall = parseFloat((sumRecall / classes.length).toFixed(4));
const macroF1 = parseFloat((sumF1 / classes.length).toFixed(4));

// Financial loss calculations
const totalFalsePositiveLoss = falsePositiveCount * COST_FALSE_POSITIVE;
const totalFalseNegativeLoss = falseNegativeCount * COST_FALSE_NEGATIVE;
const totalEstimatedIncurredLoss = totalFalsePositiveLoss + totalFalseNegativeLoss;

// Prevented loss: all DECLINE cases correctly identified
const correctlyDeclined = confusionMatrix.DECLINE.DECLINE;
const totalLossPrevented = correctlyDeclined * COST_FALSE_NEGATIVE;

const finalMetrics = {
  timestamp: new Date().toISOString(),
  datasetSize: totalSamples,
  classes,
  overallAccuracy: parseFloat(overallAccuracy.toFixed(4)),
  macroMetrics: {
    precision: macroPrecision,
    recall: macroRecall,
    f1Score: macroF1,
  },
  perClassMetrics,
  financialLossModel: {
    assumptions: {
      costPerFalsePositiveUsd: COST_FALSE_POSITIVE,
      costPerFalseNegativeUsd: COST_FALSE_NEGATIVE,
    },
    falsePositiveCount,
    falsePositiveRate: parseFloat((falsePositiveCount / totalLegitimate).toFixed(4)),
    falseNegativeCount,
    falseNegativeRate: parseFloat((falseNegativeCount / totalFraudulent).toFixed(4)),
    totalFalsePositiveCostUsd: totalFalsePositiveLoss,
    totalFalseNegativeCostUsd: totalFalseNegativeLoss,
    totalEstimatedIncurredLossUsd: totalEstimatedIncurredLoss,
    totalEstimatedLossPreventedUsd: totalLossPrevented,
    netDefensiveSavingsUsd: totalLossPrevented - totalEstimatedIncurredLoss,
  },
};

const resultsDir = path.join(__dirname, '../results');
if (!fs.existsSync(resultsDir)) {
  fs.mkdirSync(resultsDir, { recursive: true });
}

// 1. Write metrics.json
fs.writeFileSync(
  path.join(resultsDir, 'metrics.json'),
  JSON.stringify(finalMetrics, null, 2),
  'utf-8'
);

// 2. Write confusion-matrix.json
fs.writeFileSync(
  path.join(resultsDir, 'confusion-matrix.json'),
  JSON.stringify(confusionMatrix, null, 2),
  'utf-8'
);

// 3. Write report.md
const reportContent = `# RiskyPlay Evaluation Benchmark Report

## 1. Executive Summary

This report presents an empirical evaluation of the RiskyPlay Deterministic Risk Engine on a standardized, held-out synthetic evaluation dataset.

- **Evaluation Dataset Size**: ${totalSamples} labeled transactions
- **Overall Accuracy**: ${(overallAccuracy * 100).toFixed(2)}%
- **Macro F1-Score**: ${(macroF1 * 100).toFixed(2)}%
- **Macro Precision**: ${(macroPrecision * 100).toFixed(2)}%
- **Macro Recall**: ${(macroRecall * 100).toFixed(2)}%
- **Total Fraud Loss Prevented**: $${totalLossPrevented.toLocaleString()} USD
- **Net Defensive Savings**: $${(totalLossPrevented - totalEstimatedIncurredLoss).toLocaleString()} USD

---

## 2. Confusion Matrix

| Ground Truth \\ Predicted | APPROVE | REVIEW | DECLINE | Total |
| :--- | :---: | :---: | :---: | :---: |
| **APPROVE** (Low Risk) | **${confusionMatrix.APPROVE.APPROVE}** | ${confusionMatrix.APPROVE.REVIEW} | ${confusionMatrix.APPROVE.DECLINE} | ${confusionMatrix.APPROVE.APPROVE + confusionMatrix.APPROVE.REVIEW + confusionMatrix.APPROVE.DECLINE} |
| **REVIEW** (Medium Risk) | ${confusionMatrix.REVIEW.APPROVE} | **${confusionMatrix.REVIEW.REVIEW}** | ${confusionMatrix.REVIEW.DECLINE} | ${confusionMatrix.REVIEW.APPROVE + confusionMatrix.REVIEW.REVIEW + confusionMatrix.REVIEW.DECLINE} |
| **DECLINE** (High Risk) | ${confusionMatrix.DECLINE.APPROVE} | ${confusionMatrix.DECLINE.REVIEW} | **${confusionMatrix.DECLINE.DECLINE}** | ${confusionMatrix.DECLINE.APPROVE + confusionMatrix.DECLINE.REVIEW + confusionMatrix.DECLINE.DECLINE} |

---

## 3. Per-Class Metrics

| Risk Tier | Precision | Recall | F1-Score | True Positives | False Positives | False Negatives |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **APPROVE** | ${(perClassMetrics.APPROVE.precision * 100).toFixed(1)}% | ${(perClassMetrics.APPROVE.recall * 100).toFixed(1)}% | ${(perClassMetrics.APPROVE.f1Score * 100).toFixed(1)}% | ${perClassMetrics.APPROVE.truePositives} | ${perClassMetrics.APPROVE.falsePositives} | ${perClassMetrics.APPROVE.falseNegatives} |
| **REVIEW** | ${(perClassMetrics.REVIEW.precision * 100).toFixed(1)}% | ${(perClassMetrics.REVIEW.recall * 100).toFixed(1)}% | ${(perClassMetrics.REVIEW.f1Score * 100).toFixed(1)}% | ${perClassMetrics.REVIEW.truePositives} | ${perClassMetrics.REVIEW.falsePositives} | ${perClassMetrics.REVIEW.falseNegatives} |
| **DECLINE** | ${(perClassMetrics.DECLINE.precision * 100).toFixed(1)}% | ${(perClassMetrics.DECLINE.recall * 100).toFixed(1)}% | ${(perClassMetrics.DECLINE.f1Score * 100).toFixed(1)}% | ${perClassMetrics.DECLINE.truePositives} | ${perClassMetrics.DECLINE.falsePositives} | ${perClassMetrics.DECLINE.falseNegatives} |

---

## 4. Merchant-Loss Financial Impact Analysis

Transparent assumptions:
- **Cost per False Positive**: **$${COST_FALSE_POSITIVE.toFixed(2)} USD** (Customer friction, manual verification review time, cart dropoff risk).
- **Cost per False Negative**: **$${COST_FALSE_NEGATIVE.toFixed(2)} USD** (Direct financial liability, chargeback network fee, lost item cost).

### Financial Outcome:
- **False Positive Count**: ${falsePositiveCount} (${(finalMetrics.financialLossModel.falsePositiveRate * 100).toFixed(1)}% of legitimate orders)
- **False Negative Count**: ${falseNegativeCount} (${(finalMetrics.financialLossModel.falseNegativeRate * 100).toFixed(1)}% of high-risk orders)
- **False Positive Friction Cost**: $${totalFalsePositiveLoss.toFixed(2)} USD
- **False Negative Fraud Cost**: $${totalFalseNegativeLoss.toFixed(2)} USD
- **Gross Prevented Merchant Fraud**: $${totalLossPrevented.toFixed(2)} USD
- **Net Merchant Defensive Value**: **$${(totalLossPrevented - totalEstimatedIncurredLoss).toFixed(2)} USD**

---

## 5. Methodology & Known Limitations

1. **Synthetic Held-Out Dataset**: The evaluation uses a reproducible 150-sample dataset across varied e-commerce categories (Electronics, Apparel, Gaming, Digital Goods, Jewelry).
2. **Defensive Baseline Authority**: The numbers reflect the deterministic baseline rule engine, guaranteeing reproducible, explainable scoring.
3. **AI Enhancement Layer**: When enabled, the AI Risk Analyst layer provides contextual explanations and assists in disambiguating borderline REVIEW transactions without altering the baseline financial authority.
4. **No Unsubstantiated Claims**: Figures reflect exact calculations on the benchmark dataset. Production metrics may vary based on merchant-specific transaction profiles and chargeback thresholds.
`;

fs.writeFileSync(path.join(resultsDir, 'report.md'), reportContent, 'utf-8');

console.log('Evaluation Complete:');
console.log(`- Accuracy: ${(overallAccuracy * 100).toFixed(2)}%`);
console.log(`- Macro F1: ${(macroF1 * 100).toFixed(2)}%`);
console.log(`- Net Savings: $${(totalLossPrevented - totalEstimatedIncurredLoss).toLocaleString()} USD`);
console.log(`- Results saved to ${resultsDir}`);
