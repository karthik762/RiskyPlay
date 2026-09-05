/**
 * ChargebackResponseVerificationAgent — Specialized deterministic response verifier.
 * Performs rigorous fact-checking and evidence grounding on AI-generated rebuttal drafts.
 * Strictly NEVER calls an LLM and NEVER overrides canonical deterministic authority.
 */

'use strict';

const Agent = require('../core/Agent');
const AgentResult = require('../core/AgentResult');
const AgentError = require('../core/AgentError');

// Prohibited fraud accusations and outcome guarantees
const PROHIBITED_FRAUD_PATTERNS = [
  /cardholder\s+is\s+lying/i,
  /fraudulent\s+customer/i,
  /fraudster/i,
  /criminal/i,
  /stolen\s+card/i,
  /bad\s+faith/i,
  /scammer/i,
  /account\s+takeover/i,
  /fabricated\s+claim/i,
];

const PROHIBITED_OUTCOME_PATTERNS = [
  /we\s+will\s+win/i,
  /guaranteed\s+(?:to\s+win|victory|reversal)/i,
  /issuer\s+must\s+(?:find\s+in\s+our\s+favor|reverse)/i,
  /definite\s+win/i,
  /undeniable\s+proof\s+that\s+guarantees/i,
  /submission\s+complete/i,
  /has\s+been\s+submitted\s+to\s+(?:visa|mastercard|amex|discover|network|bank)/i,
];

class ChargebackResponseVerificationAgent extends Agent {
  constructor() {
    super({
      name: 'CHARGEBACK_RESPONSE_VERIFICATION',
      version: '1.0.0',
      description: 'Deterministically verifies response claims, evidence citations, and factual grounding',
    });
  }

  /**
   * Executes deterministic verification of predecessor chargeback response.
   *
   * @param {import('../core/AgentContext')} context - Execution context
   * @returns {Promise<AgentResult>}
   */
  async execute(context) {
    // 1. Dependency check
    const responseResult = context.getResult('CHARGEBACK_RESPONSE');
    if (!responseResult || typeof responseResult !== 'object') {
      throw new AgentError(
        'MISSING_PREDECESSOR_RESULT',
        "ChargebackResponseVerificationAgent requires 'CHARGEBACK_RESPONSE' predecessor result",
        this.name
      );
    }

    const warnings = [];
    const unsupportedClaims = [];
    const argumentGrounding = [];

    let verificationStatus = 'VERIFIED';

    if (responseResult.status === 'UNAVAILABLE' || responseResult.status === 'SKIPPED') {
      verificationStatus = 'AI_UNAVAILABLE';
      warnings.push('AI chargeback response was unavailable; skipping draft verification');
    } else if (responseResult.status === 'FAILED') {
      verificationStatus = 'REJECTED';
      warnings.push(`AI chargeback responder failed: ${responseResult.error || 'Unknown error'}`);
    } else if (responseResult.status === 'SUCCESS') {
      const responseText = responseResult.responseText || '';
      const keyArguments = Array.isArray(responseResult.keyArguments) ? responseResult.keyArguments : [];
      const summary = responseResult.summary || '';

      // Gather known evidence IDs from context
      const knownEvidenceItems = Array.isArray(context.evidenceIndex?.items)
        ? context.evidenceIndex.items
        : Array.isArray(context.evidenceItems)
          ? context.evidenceItems
          : [];

      const knownEvidenceIds = new Set(
        knownEvidenceItems.map((item) => (item._id ? item._id.toString() : item.id)).filter(Boolean)
      );

      // Known factual pool for cross-referencing
      const knownAmounts = new Set();
      if (context.chargeback?.disputeAmount != null) {
        knownAmounts.add(Number(context.chargeback.disputeAmount).toFixed(2));
      }
      if (context.transaction?.amount != null) {
        knownAmounts.add(Number(context.transaction.amount).toFixed(2));
      }

      const knownDates = new Set();
      if (context.transaction?.createdAt) {
        knownDates.add(new Date(context.transaction.createdAt).toISOString().slice(0, 10));
      }
      if (context.chargeback?.disputeDate) {
        knownDates.add(new Date(context.chargeback.disputeDate).toISOString().slice(0, 10));
      }

      knownEvidenceItems.forEach((ev) => {
        const facts = ev.extractedFacts || {};
        if (facts.amount != null) knownAmounts.add(Number(facts.amount).toFixed(2));
        if (facts.deliveryDate) knownDates.add(new Date(facts.deliveryDate).toISOString().slice(0, 10));
        if (facts.orderDate) knownDates.add(new Date(facts.orderDate).toISOString().slice(0, 10));
      });

      // A. Check Prohibited Claims in all text surfaces
      const combinedText = `${responseText} ${summary} ${keyArguments.map((a) => a.claim || '').join(' ')}`;

      for (const pattern of PROHIBITED_FRAUD_PATTERNS) {
        if (pattern.test(combinedText)) {
          unsupportedClaims.push({
            claimType: 'UNSUPPORTED_FRAUD_CLAIM',
            text: pattern.source,
            reason: 'Accuses cardholder of fraud or criminal intent without legal adjudication',
          });
          warnings.push('Prohibited customer fraud accusation detected in response text');
          verificationStatus = 'REJECTED';
        }
      }

      for (const pattern of PROHIBITED_OUTCOME_PATTERNS) {
        if (pattern.test(combinedText)) {
          unsupportedClaims.push({
            claimType: 'UNSUPPORTED_OUTCOME_CLAIM',
            text: pattern.source,
            reason: 'Asserts guaranteed dispute outcome or improper submission status',
          });
          warnings.push('Prohibited outcome guarantee or submission assertion detected');
          verificationStatus = 'REJECTED';
        }
      }

      // B. Verify Key Arguments and Cited Evidence IDs
      let hasMissingEvidenceId = false;

      for (const arg of keyArguments) {
        const citedIds = Array.isArray(arg.evidenceItemIds) ? arg.evidenceItemIds : [];
        const missingIds = citedIds.filter((id) => !knownEvidenceIds.has(String(id)));

        if (citedIds.length === 0) {
          argumentGrounding.push({
            claim: arg.claim,
            evidenceItemIds: [],
            status: 'UNGROUNDED',
            reason: 'Claim does not cite any supporting evidence item',
          });
          unsupportedClaims.push({
            claimType: 'UNCITED_CLAIM',
            text: arg.claim,
            reason: 'Argument has no supporting evidence item IDs',
          });
          warnings.push(`Claim "${arg.claim}" has no evidence citations`);
        } else if (missingIds.length > 0) {
          hasMissingEvidenceId = true;
          argumentGrounding.push({
            claim: arg.claim,
            evidenceItemIds: citedIds,
            status: 'UNGROUNDED',
            reason: `Cites nonexistent evidence IDs: ${missingIds.join(', ')}`,
          });
          unsupportedClaims.push({
            claimType: 'MISSING_EVIDENCE_ID',
            text: missingIds.join(', '),
            reason: 'Cited evidence ID does not belong to this chargeback',
          });
          warnings.push(`Claim cites unknown evidence IDs: ${missingIds.join(', ')}`);
        } else {
          argumentGrounding.push({
            claim: arg.claim,
            evidenceItemIds: citedIds,
            status: 'GROUNDED',
            reason: 'All cited evidence IDs exist and belong to the chargeback',
          });
        }
      }

      if (hasMissingEvidenceId && verificationStatus !== 'REJECTED') {
        verificationStatus = 'REJECTED';
      }

      // C. Extract amounts from response text and check against known amounts
      const extractedAmountMatches = responseText.match(/\$\s*(\d+(?:\.\d{2})?)/g);
      if (extractedAmountMatches) {
        for (const match of extractedAmountMatches) {
          const num = parseFloat(match.replace(/[$\s]/g, '')).toFixed(2);
          if (!knownAmounts.has(num)) {
            unsupportedClaims.push({
              claimType: 'UNSUPPORTED_AMOUNT',
              text: match,
              reason: `Amount ${match} does not match transaction or dispute records`,
            });
            warnings.push(`Response references unverified dollar amount: ${match}`);
          }
        }
      }

      // D. Final status determination
      if (verificationStatus !== 'REJECTED') {
        if (warnings.length > 0 || unsupportedClaims.length > 0) {
          verificationStatus = 'VERIFIED_WITH_WARNINGS';
        } else {
          verificationStatus = 'VERIFIED';
        }
      }
    }

    const output = {
      status: verificationStatus,
      warnings,
      unsupportedClaims,
      argumentGrounding,
      verifiedAt: new Date().toISOString(),
    };

    const reasoning = {
      evidenceConsidered: [
        `response text length ${responseResult.responseText?.length || 0} chars`,
        `${responseResult.keyArguments?.length || 0} key argument(s) evaluated`,
        `${context.evidenceIndex?.items?.length || 0} known evidence item(s) checked`,
      ],
      validationPerformed: [
        'predecessor response check',
        'evidence item ID existence and scoping',
        'prohibited fraud claim screening',
        'prohibited outcome guarantee screening',
        'numerical amount fact-checking',
      ],
      decisionProduced: `Verification concluded with status '${verificationStatus}' (${warnings.length} warning(s))`,
    };

    return AgentResult.success({
      agentName: this.name,
      agentVersion: this.version,
      output,
      reasoning,
    });
  }
}

module.exports = ChargebackResponseVerificationAgent;
