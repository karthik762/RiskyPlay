/**
 * AI Chargeback Response Service Client.
 * Communicates with the Python AI Service to generate defensive rebuttal drafts.
 * Implements graceful fallback and strict response validation.
 */

const env = require('../config/env');
const { sanitizeTransactionForAI } = require('./aiRiskService');

/**
 * Sanitizes dispute and evidence metadata for AI service ingestion.
 * Strictly excludes internal secrets and preserves tenant scoping.
 *
 * @param {Object} params
 * @param {Object} params.chargeback - Stored Chargeback document
 * @param {Object} [params.transaction] - Stored Transaction document
 * @param {Object} [params.evidenceIndex] - Pre-built evidence index from evidenceService
 * @returns {Object} Sanitized chargeback payload
 */
function sanitizeChargebackPayload({ chargeback, transaction, evidenceIndex }) {
  const cbDoc = typeof chargeback?.toObject === 'function' ? chargeback.toObject() : (chargeback || {});
  const txDoc = transaction ? (typeof transaction.toObject === 'function' ? transaction.toObject() : transaction) : null;

  const rawItems = Array.isArray(evidenceIndex?.items)
    ? evidenceIndex.items
    : Array.isArray(evidenceIndex)
      ? evidenceIndex
      : [];

  const evidenceItems = rawItems.map((item) => {
    const iDoc = typeof item?.toObject === 'function' ? item.toObject() : item;
    return {
      id: (iDoc._id ? iDoc._id.toString() : iDoc.id) || '',
      evidenceType: iDoc.evidenceType || 'OTHER',
      title: iDoc.title || undefined,
      extractedFacts: iDoc.extractedFacts && typeof iDoc.extractedFacts === 'object' ? iDoc.extractedFacts : undefined,
      summary: iDoc.summary || undefined,
    };
  });

  return {
    chargeback: {
      id: (cbDoc._id ? cbDoc._id.toString() : cbDoc.id) || '',
      disputeAmount: Number(cbDoc.disputeAmount) || 0,
      currency: cbDoc.currency || 'USD',
      reasonCode: cbDoc.reasonCode || undefined,
      reasonCategory: cbDoc.reasonCategory || undefined,
      stage: cbDoc.stage || undefined,
      network: cbDoc.network || undefined,
    },
    transaction: txDoc ? sanitizeTransactionForAI(txDoc) : undefined,
    evidenceItems,
    evidenceCompletenessScore: typeof evidenceIndex?.completenessScore === 'number'
      ? evidenceIndex.completenessScore
      : undefined,
    missingCriticalTypes: Array.isArray(evidenceIndex?.missingCriticalTypes)
      ? evidenceIndex.missingCriticalTypes
      : [],
  };
}

/**
 * Calls the Python AI service to draft a defensive chargeback response.
 * Never throws fatal exceptions; gracefully returns error status on network/validation failure.
 *
 * @param {Object} params
 * @param {Object} params.chargeback - Stored Chargeback document
 * @param {Object} [params.transaction] - Stored Transaction document
 * @param {Object} [params.evidenceIndex] - Pre-built evidence index
 * @param {Object} [params.options] - Optional override parameters (timeoutMs, serviceUrl)
 * @returns {Promise<Object>} { success: boolean, status: string, responseText, keyArguments, suggestedRecommendation, confidence, summary, error }
 */
async function generateChargebackResponse({ chargeback, transaction, evidenceIndex, options = {} }) {
  const serviceUrl = options.serviceUrl || env.AI_SERVICE_URL || 'http://localhost:8000';
  const timeoutMs = options.timeoutMs || 5000;

  const payload = sanitizeChargebackPayload({ chargeback, transaction, evidenceIndex });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `${serviceUrl.replace(/\/+$/, '')}/api/v1/chargebacks/response/generate`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      return {
        success: false,
        status: 'UNAVAILABLE',
        error: `AI service returned HTTP ${response.status}: ${errorText.slice(0, 150)}`,
      };
    }

    const data = await response.json();

    // Verify response contract strictly
    const isValidText = typeof data.responseText === 'string' && data.responseText.trim().length >= 10;
    const isValidArgs = Array.isArray(data.keyArguments);
    const validRecs = ['DEFEND', 'DEFEND_WITH_REVIEW', 'INSUFFICIENT_EVIDENCE', 'DO_NOT_RECOMMEND_DEFENSE'];
    const isValidRec = validRecs.includes(data.suggestedRecommendation);
    const isValidConfidence = typeof data.confidence === 'number' && data.confidence >= 0 && data.confidence <= 1;

    if (!isValidText || !isValidArgs || !isValidRec || !isValidConfidence) {
      return {
        success: false,
        status: 'FAILED',
        error: 'AI service chargeback response failed contract validation',
      };
    }

    return {
      success: true,
      status: 'SUCCESS',
      responseText: data.responseText,
      keyArguments: data.keyArguments.map((arg) => ({
        claim: String(arg.claim || ''),
        evidenceItemIds: Array.isArray(arg.evidenceItemIds) ? arg.evidenceItemIds.map(String) : [],
        groundingExplanation: String(arg.groundingExplanation || ''),
      })),
      suggestedRecommendation: data.suggestedRecommendation,
      confidence: data.confidence,
      summary: typeof data.summary === 'string' ? data.summary : '',
    };
  } catch (error) {
    clearTimeout(timeoutId);
    const isTimeout = error.name === 'AbortError';
    return {
      success: false,
      status: 'UNAVAILABLE',
      error: isTimeout ? `AI service request timed out after ${timeoutMs}ms` : error.message,
    };
  }
}

module.exports = {
  sanitizeChargebackPayload,
  generateChargebackResponse,
};
