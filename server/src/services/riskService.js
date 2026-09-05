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
const aiRiskService = require('./aiRiskService');
const AppError = require('../utils/AppError');

/**
 * Validates internal consistency across risk assessment attributes before persistence.
 * Prevents corrupted or contradictory risk states from entering the database.
 *
 * @param {number} riskScore - Calculated risk score
 * @param {string} riskTier - Assigned risk tier ('LOW' | 'MEDIUM' | 'HIGH')
 * @param {string} recommendation - Assigned action ('APPROVE' | 'REVIEW' | 'DECLINE')
 * @param {number} baselineScore - Recorded baseline score
 * @param {number|null} aiScore - Recorded AI score (null or integer between 0 and 100)
 * @throws {AppError} If any invariant is violated
 */
function enforceRiskInvariants(riskScore, riskTier, recommendation, baselineScore, aiScore) {
  // Invariant 1: riskScore must be an integer between 0 and 100
  if (!Number.isInteger(riskScore) || riskScore < 0 || riskScore > 100) {
    throw new AppError(
      `Internal Invariant Violation: riskScore must be an integer between 0 and 100, received ${riskScore}`,
      500,
      'INTERNAL_INVARIANT_ERROR'
    );
  }

  // Invariant 2: riskTier must correspond strictly to riskScore tier thresholds
  let expectedTier;
  if (riskScore >= riskConfig.TIERS.HIGH.min) {
    expectedTier = 'HIGH';
  } else if (riskScore >= riskConfig.TIERS.MEDIUM.min) {
    expectedTier = 'MEDIUM';
  } else {
    expectedTier = 'LOW';
  }

  if (riskTier !== expectedTier) {
    throw new AppError(
      `Internal Invariant Violation: riskTier '${riskTier}' does not match score ${riskScore} (expected '${expectedTier}')`,
      500,
      'INTERNAL_INVARIANT_ERROR'
    );
  }

  // Invariant 3: recommendation must correspond strictly to riskTier
  const expectedRec = riskConfig.TIER_RECOMMENDATIONS[expectedTier];
  if (recommendation !== expectedRec) {
    throw new AppError(
      `Internal Invariant Violation: recommendation '${recommendation}' does not match tier '${riskTier}' (expected '${expectedRec}')`,
      500,
      'INTERNAL_INVARIANT_ERROR'
    );
  }

  // Invariant 4: baselineScore must strictly equal the deterministic riskScore
  if (baselineScore !== riskScore) {
    throw new AppError(
      `Internal Invariant Violation: baselineScore (${baselineScore}) must equal riskScore (${riskScore})`,
      500,
      'INTERNAL_INVARIANT_ERROR'
    );
  }

  // Invariant 5: aiScore must be null or an integer between 0 and 100
  if (aiScore !== null && aiScore !== undefined) {
    if (!Number.isInteger(aiScore) || aiScore < 0 || aiScore > 100) {
      throw new AppError(
        `Internal Invariant Violation: aiScore must be an integer between 0 and 100 or null, received ${aiScore}`,
        500,
        'INTERNAL_INVARIANT_ERROR'
      );
    }
  }
}

/**
 * Pure calculation function that evaluates deterministic risk rules against a transaction.
 * Operates entirely in-memory with zero network or database dependencies.
 * Guaranteed to never mutate the input transaction object.
 *
 * @param {Object} transaction - Transaction data object
 * @param {Object} [config] - Injected risk configuration
 * @returns {Object} { riskScore, riskTier, recommendation, signals, ruleMatches }
 */
function calculateRisk(transaction, config = riskConfig) {
  if (!transaction || typeof transaction !== 'object') {
    return {
      riskScore: 0,
      riskTier: 'LOW',
      recommendation: config.TIER_RECOMMENDATIONS.LOW,
      signals: [],
      ruleMatches: [],
    };
  }

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

  // Clamping score strictly between 0 and 100 as integer
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
 * Formats and sanitizes a RiskAssessment document into the stable API response contract.
 * Excludes internal MongoDB implementation details (__v), secrets, and transaction PII.
 *
 * @param {Object} assessment - RiskAssessment document or plain object
 * @returns {Object} Clean RiskAssessment response
 */
function formatRiskAssessment(assessment) {
  if (!assessment) return null;
  const doc = typeof assessment.toObject === 'function' ? assessment.toObject() : assessment;

  const id = (doc._id || doc.id)?.toString();

  const formatted = {
    id,
    _id: doc._id, // Retained for backward-compatibility with tests checking _id
    transactionId: doc.transactionId,
    merchantId: doc.merchantId,
    riskScore: doc.riskScore,
    riskTier: doc.riskTier,
    recommendation: doc.recommendation,
    baselineScore: doc.baselineScore,
    aiScore: doc.aiScore ?? null,
    signals: Array.isArray(doc.signals)
      ? doc.signals.map((s) => ({
          code: s.code,
          description: s.description,
          severity: s.severity,
          confidence: s.confidence,
        }))
      : [],
    ruleMatches: Array.isArray(doc.ruleMatches)
      ? doc.ruleMatches.map((r) => ({
          rule: r.rule || r.ruleId,
          ruleId: r.ruleId || r.rule,
          ruleName: r.ruleName,
          points: r.points,
          reason: r.reason,
          action: r.action,
          triggered: r.triggered ?? true,
        }))
      : [],
    createdAt: doc.createdAt,
  };

  if (doc.aiAnalysis) {
    formatted.aiAnalysis = {
      status: doc.aiAnalysis.status,
      summary: doc.aiAnalysis.summary,
      riskFactors: Array.isArray(doc.aiAnalysis.riskFactors)
        ? doc.aiAnalysis.riskFactors.map((rf) => ({
            code: rf.code,
            description: rf.description,
            severity: rf.severity,
          }))
        : [],
      aiTier: doc.aiAnalysis.aiTier,
      aiRecommendation: doc.aiAnalysis.aiRecommendation,
      error: doc.aiAnalysis.error,
    };
  }

  if (doc.verification) {
    formatted.verification = {
      status: doc.verification.status,
      scoreDelta: doc.verification.scoreDelta,
      tierAgreement: doc.verification.tierAgreement,
      recommendationAgreement: doc.verification.recommendationAgreement,
      warnings: Array.isArray(doc.verification.warnings) ? [...doc.verification.warnings] : [],
      verifiedAt: doc.verification.verifiedAt,
    };
  }

  return formatted;
}

/**
 * Assesses transaction risk for an authenticated merchant and persists the RiskAssessment document.
 * Enforces tenant ownership by querying for the transaction with both _id and merchantId.
 * Executes AI risk analysis with graceful fallback to deterministic baseline.
 * Validates invariants prior to persistence.
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

  // 3. Attempt AI Risk Analysis with Graceful Degradation
  let aiScore = null;
  let aiAnalysis = {
    status: 'UNAVAILABLE',
    summary: null,
    riskFactors: [],
    error: null,
  };

  try {
    const aiResult = await aiRiskService.analyzeTransactionRisk(transaction, result);
    if (aiResult.success) {
      aiScore = aiResult.aiScore;
      aiAnalysis = {
        status: 'SUCCESS',
        summary: aiResult.summary,
        riskFactors: aiResult.riskFactors,
        aiTier: aiResult.riskTier,
        aiRecommendation: aiResult.recommendation,
        error: null,
      };
    } else {
      aiScore = null;
      aiAnalysis = {
        status: aiResult.status || 'UNAVAILABLE',
        summary: null,
        riskFactors: [],
        error: aiResult.error || 'AI risk service unavailable',
      };
    }
  } catch (err) {
    aiScore = null;
    aiAnalysis = {
      status: 'UNAVAILABLE',
      summary: null,
      riskFactors: [],
      error: err.message,
    };
  }

  // 4. Enforce service-level data consistency invariants
  enforceRiskInvariants(
    result.riskScore,
    result.riskTier,
    result.recommendation,
    result.riskScore, // baselineScore
    aiScore
  );

  // 5. Persist RiskAssessment document
  const assessment = await RiskAssessment.create({
    transactionId: transaction._id,
    merchantId: transaction.merchantId,
    riskScore: result.riskScore,
    riskTier: result.riskTier,
    signals: result.signals,
    baselineScore: result.riskScore,
    aiScore,
    aiAnalysis,
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
  enforceRiskInvariants,
  formatRiskAssessment,
  assessAndPersistRisk,
  getLatestAssessment,
};
