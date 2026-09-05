/**
 * RiskVerificationAgent — Specialized deterministic risk verification agent.
 * Deterministically cross-validates predecessor baseline and AI risk outputs against
 * strict safety boundaries, score/tier threshold invariants, and observable evidence grounding.
 * Strictly NEVER calls an LLM and NEVER overrides canonical deterministic authority.
 */

'use strict';

const Agent = require('../core/Agent');
const AgentResult = require('../core/AgentResult');
const AgentError = require('../core/AgentError');
const riskConfig = require('../../config/riskConfig');

// Known unsupported claim patterns representing ungrounded AI speculation
const UNSUPPORTED_CLAIM_PATTERNS = [
  /account\s+takeover/i,
  /\bato\b/i,
  /stolen\s+card/i,
  /lost\s+card/i,
  /fraud\s+certainty/i,
  /confirmed\s+fraud/i,
  /definite\s+fraud/i,
  /proven\s+fraud/i,
  /known\s+bad\s+device/i,
  /fraudulent\s+device/i,
  /known\s+bad\s+ip/i,
  /compromised\s+ip/i,
  /botnet/i,
  /previous\s+customer\s+history/i,
  /prior\s+chargeback/i,
  /history\s+of\s+fraud/i,
  /external\s+fraud\s+database/i,
  /\binterpol\b/i,
  /\bblacklist\b/i,
];

// Observable evidence keywords linking factors to supplied transaction and baseline state
const OBSERVABLE_EVIDENCE_KEYWORDS = [
  'amount',
  'value',
  'threshold',
  'price',
  'high',
  'elevated',
  'currency',
  'cart',
  'item',
  'quantity',
  'mismatch',
  'sum',
  'customer',
  'email',
  'domain',
  'country',
  'issuer',
  'card',
  'bin',
  'rule',
  'baseline',
  'signals',
];

class RiskVerificationAgent extends Agent {
  constructor() {
    super({
      name: 'RISK_VERIFICATION',
      version: '1.0.0',
      description: 'Deterministically verifies predecessor baseline and AI risk outputs against safety boundaries',
    });
  }

  /**
   * Executes deterministic verification of predecessor risk outputs.
   *
   * @param {import('../core/AgentContext')} context - Execution context
   * @returns {Promise<AgentResult>}
   */
  async execute(context) {
    // 1. Dependency checks: Requires both baseline and analyst predecessor outputs
    const baseline = context.getResult('TRANSACTION_RISK_BASELINE') || context.deterministicAssessment;
    if (!baseline || typeof baseline.riskScore !== 'number') {
      throw new AgentError(
        'MISSING_PREDECESSOR_RESULT',
        "RiskVerificationAgent requires 'TRANSACTION_RISK_BASELINE' predecessor result",
        this.name
      );
    }

    const analystResult = context.getResult('RISK_ANALYST');
    if (!analystResult || typeof analystResult !== 'object') {
      throw new AgentError(
        'MISSING_PREDECESSOR_RESULT',
        "RiskVerificationAgent requires 'RISK_ANALYST' predecessor result",
        this.name
      );
    }

    const warnings = [];

    // 2. Validate Baseline Authority invariants
    let isBaselineValid = true;
    const isBaselineScoreInt = Number.isInteger(baseline.riskScore) && baseline.riskScore >= 0 && baseline.riskScore <= 100;
    const expectedBaselineTier =
      baseline.riskScore >= riskConfig.TIERS.HIGH.min
        ? 'HIGH'
        : baseline.riskScore >= riskConfig.TIERS.MEDIUM.min
        ? 'MEDIUM'
        : 'LOW';
    const expectedBaselineRec = riskConfig.TIER_RECOMMENDATIONS[expectedBaselineTier];

    if (!isBaselineScoreInt || baseline.riskTier !== expectedBaselineTier || baseline.recommendation !== expectedBaselineRec) {
      isBaselineValid = false;
      warnings.push(
        `Baseline invariant error: score ${baseline.riskScore} does not match tier '${baseline.riskTier}' or recommendation '${baseline.recommendation}'`
      );
    }

    // 3. AI Contract & Threshold Consistency Validation
    let isAiValid = false;
    let verificationStatus;
    let comparison = {
      baselineScore: baseline.riskScore,
      aiScore: null,
      scoreDelta: null,
      tierAgreement: null,
      recommendationAgreement: null,
    };

    if (analystResult.status === 'UNAVAILABLE' || analystResult.status === 'SKIPPED' || analystResult.aiScore === null) {
      verificationStatus = 'AI_UNAVAILABLE';
      warnings.push('AI advisory service was unavailable; deterministic baseline remains authoritative');
    } else if (analystResult.status === 'FAILED') {
      verificationStatus = 'REJECTED';
      warnings.push(`AI advisory output failed: ${analystResult.error || 'Contract validation failure'}`);
    } else if (analystResult.status === 'SUCCESS') {
      // Validate strict AI contract
      const isAiScoreInt = Number.isInteger(analystResult.aiScore) && analystResult.aiScore >= 0 && analystResult.aiScore <= 100;
      const isAiTierValid = ['LOW', 'MEDIUM', 'HIGH'].includes(analystResult.aiTier);
      const isAiRecValid = ['APPROVE', 'REVIEW', 'DECLINE'].includes(analystResult.aiRecommendation);

      let expectedAiTier;
      if (isAiScoreInt) {
        expectedAiTier =
          analystResult.aiScore >= riskConfig.TIERS.HIGH.min
            ? 'HIGH'
            : analystResult.aiScore >= riskConfig.TIERS.MEDIUM.min
            ? 'MEDIUM'
            : 'LOW';
      }
      const expectedAiRec = expectedAiTier ? riskConfig.TIER_RECOMMENDATIONS[expectedAiTier] : null;

      if (!isAiScoreInt || !isAiTierValid || !isAiRecValid || analystResult.aiTier !== expectedAiTier || analystResult.aiRecommendation !== expectedAiRec) {
        verificationStatus = 'REJECTED';
        warnings.push(
          `AI contract violation: score ${analystResult.aiScore}, tier '${analystResult.aiTier}', recommendation '${analystResult.aiRecommendation}' are contradictory`
        );
      } else {
        isAiValid = true;
        comparison = {
          baselineScore: baseline.riskScore,
          aiScore: analystResult.aiScore,
          scoreDelta: Math.abs(analystResult.aiScore - baseline.riskScore),
          tierAgreement: analystResult.aiTier === baseline.riskTier,
          recommendationAgreement: analystResult.aiRecommendation === baseline.recommendation,
        };
      }
    } else {
      verificationStatus = 'REJECTED';
      warnings.push(`Unrecognized AI analyst status: ${analystResult.status}`);
    }

    // 4. Risk Factor Grounding & Safety Checks
    const factorAnalysis = [];
    let hasUnsupportedClaims = false;
    let hasUnverifiedFactors = false;

    if (isAiValid && Array.isArray(analystResult.riskFactors)) {
      for (const factor of analystResult.riskFactors) {
        const text = `${factor.code || ''} ${factor.description || ''}`.trim();
        let groundingStatus = 'GROUNDED';
        let reason = 'Supported by observable transaction or baseline context';

        // Check A: Safety check for unsupported speculative/hallucinatory claims
        const isUnsupportedClaim = UNSUPPORTED_CLAIM_PATTERNS.some((pattern) => pattern.test(text));
        if (isUnsupportedClaim) {
          groundingStatus = 'UNSUPPORTED_CLAIM';
          reason = 'References external or speculative concepts not present in transaction context';
          hasUnsupportedClaims = true;
          warnings.push(`Unsupported claim detected in factor: "${factor.description || factor.code}"`);
        } else {
          // Check B: Observable evidence grounding
          const lowerText = text.toLowerCase();
          const hasObservableEvidence = OBSERVABLE_EVIDENCE_KEYWORDS.some((kw) => lowerText.includes(kw));

          if (!hasObservableEvidence) {
            groundingStatus = 'UNVERIFIED';
            reason = 'Could not be deterministically mapped to supplied transaction or baseline evidence';
            hasUnverifiedFactors = true;
            warnings.push(`Unverified factor lacking observable evidence: "${factor.description || factor.code}"`);
          }
        }

        factorAnalysis.push({
          code: factor.code,
          description: factor.description,
          severity: factor.severity,
          groundingStatus,
          reason,
        });
      }
    }

    // 5. Final Verification Status Determination
    if (isAiValid) {
      if (hasUnsupportedClaims || hasUnverifiedFactors) {
        verificationStatus = 'VERIFIED_WITH_WARNINGS';
      } else {
        verificationStatus = 'VERIFIED';
      }
    }

    // 6. Structured Output (Never replaces deterministic baseline authority)
    const output = {
      status: verificationStatus,
      baselineAuthority: {
        riskScore: baseline.riskScore,
        riskTier: baseline.riskTier,
        recommendation: baseline.recommendation,
        verified: isBaselineValid,
      },
      comparison,
      factorAnalysis,
      warnings,
      verifiedAt: new Date().toISOString(),
    };

    // 7. Structured Operational Reasoning (No chain-of-thought)
    const reasoning = {
      evidenceConsidered: [
        `deterministic baseline score ${baseline.riskScore} (${baseline.riskTier})`,
        `AI analyst status '${analystResult.status}' (score: ${analystResult.aiScore ?? 'null'})`,
        `${factorAnalysis.length} risk factor(s) evaluated`,
      ],
      validationPerformed: [
        'baseline authority check',
        'AI response contract validation',
        'threshold alignment verification',
        'observable evidence factor grounding',
        'unsupported speculative claim detection',
      ],
      decisionProduced: `Verification completed with status '${verificationStatus}'`,
    };

    return AgentResult.success({
      agentName: this.name,
      agentVersion: this.version,
      output,
      reasoning,
    });
  }
}

module.exports = RiskVerificationAgent;
