const mongoose = require('mongoose');
const riskConfig = require('../config/riskConfig');
const {
  evaluateHighValue,
  evaluateMediumValue,
  evaluateCustomerIncomplete,
  evaluateCartMismatch,
  evaluateLargeQuantity,
} = require('./riskRules');
const { Transaction, RiskAssessment } = require('../models');
const AppError = require('../utils/AppError');

/**
 * Pure calculation function that evaluates deterministic risk rules against a transaction.
 * Operates entirely in-memory with zero network or database dependencies.
 *
 * @param {Object} transaction - Transaction data object
 * @param {Object} [config] - Injected risk configuration
 * @returns {Object} { riskScore, riskTier, recommendation, signals, ruleMatches }
 */
function calculateRisk(transaction, config = riskConfig) {
  const ruleEvaluators = [
    evaluateHighValue,
    evaluateMediumValue,
    evaluateCustomerIncomplete,
    evaluateCartMismatch,
    evaluateLargeQuantity,
  ];

  const signals = [];
  const ruleMatches = [];
  let rawScore = 0;

  for (const evaluate of ruleEvaluators) {
    const outcome = evaluate(transaction, config);
    if (outcome) {
      signals.push(outcome.signal);
      ruleMatches.push(outcome.ruleMatch);
      rawScore += outcome.ruleMatch.points;
    }
  }

  // Clamping score between 0 and 100 as integer
  const riskScore = Math.min(100, Math.max(0, Math.round(rawScore)));

  // Determine risk tier
  let riskTier;
  if (riskScore >= config.TIERS.HIGH.min) {
    riskTier = 'HIGH';
  } else if (riskScore >= config.TIERS.MEDIUM.min) {
    riskTier = 'MEDIUM';
  } else {
    riskTier = 'LOW';
  }

  // Determine recommendation from tier
  const recommendation = config.TIER_RECOMMENDATIONS[riskTier] || 'REVIEW';

  return {
    riskScore,
    riskTier,
    recommendation,
    signals,
    ruleMatches,
  };
}

/**
 * Assesses transaction risk for an authenticated merchant and persists the RiskAssessment document.
 * Enforces tenant ownership by querying for the transaction with both _id and merchantId.
 *
 * @param {string} merchantId - Authenticated merchant ObjectId
 * @param {string} transactionId - Transaction ObjectId to assess
 * @param {Object} [config] - Injected risk configuration
 * @returns {Promise<Object>} Persisted RiskAssessment document
 */
async function assessAndPersistRisk(merchantId, transactionId, config = riskConfig) {
  if (!mongoose.Types.ObjectId.isValid(transactionId)) {
    throw new AppError('Invalid transaction ID', 400, 'VALIDATION_ERROR');
  }

  // 1. Verify transaction exists and belongs strictly to the authenticated merchant
  const transaction = await Transaction.findOne({
    _id: transactionId,
    merchantId,
  });

  if (!transaction) {
    throw new AppError('Transaction not found', 404, 'TRANSACTION_NOT_FOUND');
  }

  // 2. Execute deterministic risk calculation
  const result = calculateRisk(transaction, config);

  // 3. Persist RiskAssessment document
  const assessment = await RiskAssessment.create({
    transactionId: transaction._id,
    merchantId: transaction.merchantId,
    riskScore: result.riskScore,
    riskTier: result.riskTier,
    signals: result.signals,
    baselineScore: result.riskScore,
    aiScore: null,
    recommendation: result.recommendation,
    ruleMatches: result.ruleMatches,
  });

  return assessment;
}

/**
 * Retrieves the latest RiskAssessment for a transaction belonging to the authenticated merchant.
 *
 * @param {string} merchantId - Authenticated merchant ObjectId
 * @param {string} transactionId - Transaction ObjectId
 * @returns {Promise<Object>} Latest RiskAssessment document
 */
async function getLatestAssessment(merchantId, transactionId) {
  if (!mongoose.Types.ObjectId.isValid(transactionId)) {
    throw new AppError('Invalid transaction ID', 400, 'VALIDATION_ERROR');
  }

  // 1. Verify transaction exists and belongs strictly to the authenticated merchant
  const transaction = await Transaction.findOne({
    _id: transactionId,
    merchantId,
  });

  if (!transaction) {
    throw new AppError('Transaction not found', 404, 'TRANSACTION_NOT_FOUND');
  }

  // 2. Fetch the most recent assessment for this transaction
  const assessment = await RiskAssessment.findOne({
    transactionId: transaction._id,
  }).sort({ createdAt: -1 });

  if (!assessment) {
    throw new AppError(
      'Risk assessment not found for this transaction',
      404,
      'RISK_ASSESSMENT_NOT_FOUND'
    );
  }

  return assessment;
}

module.exports = {
  calculateRisk,
  assessAndPersistRisk,
  getLatestAssessment,
};
