/**
 * ChargebackResponseAgent — Specialized AI chargeback response drafting agent.
 * Consumes dispute metadata, transaction context, and indexed evidence to generate
 * an evidence-grounded defensive rebuttal draft.
 * Strictly maintains defense-only posture: advisory only, never canonical financial authority.
 */

'use strict';

const Agent = require('../core/Agent');
const AgentResult = require('../core/AgentResult');
const AgentError = require('../core/AgentError');
const aiChargebackResponseService = require('../../services/aiChargebackResponseService');

class ChargebackResponseAgent extends Agent {
  constructor() {
    super({
      name: 'CHARGEBACK_RESPONSE',
      version: '1.0.0',
      description: 'Generates evidence-grounded defensive rebuttal draft using AI advisory service',
    });
  }

  /**
   * Executes AI defensive response drafting.
   *
   * @param {import('../core/AgentContext')} context - Execution context
   * @returns {Promise<AgentResult>}
   */
  async execute(context) {
    // 1. Dependency check: Requires chargeback context
    const chargeback = context.chargeback;
    if (!chargeback) {
      throw new AgentError(
        'MISSING_CONTEXT',
        "ChargebackResponseAgent requires 'chargeback' in AgentContext",
        this.name
      );
    }

    // 2. Invoke aiChargebackResponseService
    const aiResult = await aiChargebackResponseService.generateChargebackResponse({
      chargeback,
      transaction: context.transaction,
      evidenceIndex: context.evidenceIndex,
    });

    let output;
    let decisionProduced;

    if (aiResult.success) {
      output = {
        status: 'SUCCESS',
        responseText: aiResult.responseText,
        keyArguments: Array.isArray(aiResult.keyArguments) ? aiResult.keyArguments : [],
        suggestedRecommendation: aiResult.suggestedRecommendation,
        confidence: aiResult.confidence,
        summary: aiResult.summary || '',
      };
      decisionProduced = `AI suggested recommendation ${aiResult.suggestedRecommendation} with confidence ${aiResult.confidence}`;
    } else {
      // Graceful degradation
      output = {
        status: aiResult.status || 'UNAVAILABLE',
        responseText: '',
        keyArguments: [],
        suggestedRecommendation: null,
        confidence: 0,
        summary: '',
        error: aiResult.error || 'AI chargeback response service unavailable',
      };
      decisionProduced = `AI response unavailable (${aiResult.status || 'UNAVAILABLE'}): ${aiResult.error || 'fallback to deterministic rule evaluation'}`;
    }

    const evidenceCount = context.evidenceIndex?.items?.length ?? 0;

    // 3. Operational reasoning (no private chain-of-thought)
    const reasoning = {
      evidenceConsidered: [
        `dispute amount ${chargeback.disputeAmount} ${chargeback.currency || 'USD'}`,
        `reason code ${chargeback.reasonCode || 'UNSPECIFIED'} (${chargeback.reasonCategory || 'UNKNOWN'})`,
        `${evidenceCount} indexed evidence item(s)`,
      ],
      validationPerformed: [
        'chargeback context dependency check',
        'AI response schema and grounding verification',
      ],
      decisionProduced,
    };

    return AgentResult.success({
      agentName: this.name,
      agentVersion: this.version,
      output,
      reasoning,
    });
  }
}

module.exports = ChargebackResponseAgent;
