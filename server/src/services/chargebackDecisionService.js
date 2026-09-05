/**
 * Chargeback Decision Service.
 * Canonical deterministic policy authority for defensive chargeback recommendations.
 * Combines evidence vault completeness with verification findings to produce an authoritative decision.
 */

'use strict';

/**
 * Evaluates defense posture and produces the authoritative recommendation.
 *
 * @param {Object} params
 * @param {Object} [params.evidenceIndex] - Evidence index with completeness score and items
 * @param {Object} [params.verification] - Verification results from ChargebackResponseVerificationAgent
 * @param {Object} [params.aiResponse] - Optional advisory output from ChargebackResponseAgent
 * @returns {Object} Authoritative decision: { recommendation, confidence, reasons, authority }
 */
function evaluateChargebackDecision({ evidenceIndex, verification, aiResponse }) {
  const completenessScore = Number(evidenceIndex?.completenessScore) || 0;
  const missingCritical = Array.isArray(evidenceIndex?.missingCriticalTypes)
    ? evidenceIndex.missingCriticalTypes
    : [];
  const verificationStatus = verification?.status || 'UNVERIFIED';
  const warnings = Array.isArray(verification?.warnings) ? verification.warnings : [];
  const unsupportedClaims = Array.isArray(verification?.unsupportedClaims) ? verification.unsupportedClaims : [];

  const reasons = [];
  let recommendation;
  let baseConfidence = completenessScore / 100;

  // 1. Critical Verification Safety Check
  if (verificationStatus === 'REJECTED') {
    recommendation = 'DO_NOT_RECOMMEND_DEFENSE';
    reasons.push('Response verification failed with critical claim violations or ungrounded citations');
    baseConfidence = Math.min(baseConfidence, 0.4);
  } else if (completenessScore < 40 || missingCritical.length > 1) {
    recommendation = 'INSUFFICIENT_EVIDENCE';
    reasons.push(`Evidence completeness score is low (${completenessScore}/100)`);
    if (missingCritical.length > 0) {
      reasons.push(`Missing critical evidence types: ${missingCritical.join(', ')}`);
    }
  } else if (verificationStatus === 'VERIFIED_WITH_WARNINGS' || missingCritical.length === 1 || completenessScore < 70) {
    recommendation = 'DEFEND_WITH_REVIEW';
    if (completenessScore < 70) {
      reasons.push(`Evidence completeness is moderate (${completenessScore}/100)`);
    }
    if (missingCritical.length === 1) {
      reasons.push(`Missing recommended evidence type: ${missingCritical[0]}`);
    }
    if (warnings.length > 0) {
      reasons.push(`Response contains ${warnings.length} verification warning(s) requiring human inspection`);
    }
  } else if (verificationStatus === 'VERIFIED' && completenessScore >= 70 && missingCritical.length === 0) {
    recommendation = 'DEFEND';
    reasons.push(`High evidence completeness (${completenessScore}/100) with zero missing critical evidence types`);
    reasons.push('Response draft verified with full factual grounding and zero claim violations');
  } else {
    // Fallback safe posture
    recommendation = 'DEFEND_WITH_REVIEW';
    reasons.push('Standard human review recommended before submitting rebuttal');
  }

  // Factor in penalty for unsupported claims/warnings
  const penalty = (unsupportedClaims.length * 0.15) + (warnings.length * 0.05);
  const finalConfidence = Math.max(0.0, Math.min(1.0, parseFloat((baseConfidence - penalty).toFixed(2))));

  return {
    recommendation,
    confidence: finalConfidence,
    reasons,
    authority: 'DETERMINISTIC_POLICY',
    evaluatedAt: new Date().toISOString(),
  };
}

module.exports = {
  evaluateChargebackDecision,
};
