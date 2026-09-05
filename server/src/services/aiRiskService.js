/**
 * AI Risk Analyst Service Client.
 * Orchestrates communication between the Node backend and the Python AI Service.
 * Implements graceful degradation when the AI service or downstream LLM is unavailable.
 */

const env = require('../config/env');

/**
 * Masks an email address for privacy preservation while retaining domain metadata.
 * e.g., 'customer@example.com' -> 'c***r@example.com'
 *
 * @param {string} email - Raw email address
 * @returns {string|undefined} Masked email or undefined if invalid
 */
function maskEmail(email) {
  if (!email || typeof email !== 'string') return undefined;
  const trimmed = email.trim();
  const atIndex = trimmed.indexOf('@');
  if (atIndex <= 0 || atIndex === trimmed.length - 1) return undefined;
  const local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);
  if (local.length <= 2) {
    return `${local[0]}***@${domain}`;
  }
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

/**
 * Sanitizes transaction data for AI service ingestion.
 * Strictly excludes authentication secrets, password hashes, PAN, and CVV.
 * Minimizes PII by masking email and omitting phone, IP address, and userAgent.
 *
 * @param {Object} transaction - Transaction document or object
 * @returns {Object} Sanitized transaction metadata
 */
function sanitizeTransactionForAI(transaction) {
  const doc = typeof transaction.toObject === 'function' ? transaction.toObject() : transaction;

  return {
    id: doc._id ? doc._id.toString() : doc.id,
    externalTransactionId: doc.externalTransactionId,
    amount: doc.amount,
    currency: doc.currency || 'USD',
    status: doc.status,
    customer: doc.customer
      ? {
          email: maskEmail(doc.customer.email),
          customerId: doc.customer.customerId,
        }
      : undefined,
    paymentMethod: doc.paymentMethod
      ? {
          cardBin: doc.paymentMethod.cardBin,
          cardLast4: doc.paymentMethod.cardLast4,
          cardType: doc.paymentMethod.cardType,
          issuerCountry: doc.paymentMethod.issuerCountry,
        }
      : undefined,
    cartItems: Array.isArray(doc.cartItems)
      ? doc.cartItems.map((item) => ({
          productId: item.productId,
          title: item.title,
          price: item.price,
          quantity: item.quantity,
          category: item.category,
        }))
      : undefined,
  };
}

/**
 * Formats deterministic baseline output for AI service consumption.
 *
 * @param {Object} baseline - Deterministic baseline calculation result
 * @returns {Object} Structured baseline evidence
 */
function formatBaselineForAI(baseline) {
  return {
    riskScore: baseline.riskScore,
    riskTier: baseline.riskTier,
    recommendation: baseline.recommendation,
    signals: Array.isArray(baseline.signals)
      ? baseline.signals.map((s) => ({
          code: s.code,
          description: s.description,
          severity: s.severity,
          confidence: s.confidence,
        }))
      : [],
    ruleMatches: Array.isArray(baseline.ruleMatches)
      ? baseline.ruleMatches.map((r) => ({
          rule: r.rule || r.ruleId,
          points: r.points,
          reason: r.reason,
        }))
      : [],
  };
}

/**
 * Calls the Python AI service to execute defensive risk analysis.
 * Never throws fatal exceptions; gracefully returns error status on network/validation failure.
 *
 * @param {Object} transaction - Stored transaction document
 * @param {Object} baseline - Deterministic baseline output
 * @param {Object} [options] - Optional override parameters (timeoutMs, serviceUrl)
 * @returns {Promise<Object>} { success: boolean, status: string, aiScore, riskTier, recommendation, riskFactors, summary, error }
 */
async function analyzeTransactionRisk(transaction, baseline, options = {}) {
  const serviceUrl = options.serviceUrl || env.AI_SERVICE_URL || 'http://localhost:8000';
  const timeoutMs = options.timeoutMs || 4000;

  const payload = {
    transaction: sanitizeTransactionForAI(transaction),
    baseline: formatBaselineForAI(baseline),
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `${serviceUrl.replace(/\/+$/, '')}/api/v1/analyze/risk`;
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

    // Verify response contract strictly: aiScore must be an integer between 0 and 100
    const isValidScore =
      Number.isInteger(data.aiScore) && data.aiScore >= 0 && data.aiScore <= 100;
    const isValidTier = ['LOW', 'MEDIUM', 'HIGH'].includes(data.riskTier);
    const isValidRec = ['APPROVE', 'REVIEW', 'DECLINE'].includes(data.recommendation);

    if (!isValidScore || !isValidTier || !isValidRec) {
      return {
        success: false,
        status: 'FAILED',
        error: 'AI service response failed contract validation (invalid score, tier, or recommendation)',
      };
    }

    return {
      success: true,
      status: 'SUCCESS',
      aiScore: data.aiScore,
      riskTier: data.riskTier,
      recommendation: data.recommendation,
      riskFactors: Array.isArray(data.riskFactors) ? data.riskFactors : [],
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
  sanitizeTransactionForAI,
  formatBaselineForAI,
  analyzeTransactionRisk,
};
