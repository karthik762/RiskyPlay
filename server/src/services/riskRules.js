const riskConfig = require('../config/riskConfig');

/**
 * Evaluates Rule 1: High Transaction Value.
 * Triggers when transaction amount meets or exceeds the high-value baseline threshold.
 * Hardened against non-finite values (NaN, Infinity, -Infinity).
 *
 * @param {Object} transaction - Transaction data
 * @param {Object} [config] - Injected risk configuration
 * @returns {Object|null} Rule evaluation result or null if not triggered
 */
function evaluateHighValue(transaction, config = riskConfig) {
  const amount = Number(transaction.amount);
  if (Number.isFinite(amount) && amount >= config.THRESHOLDS.HIGH_VALUE_THRESHOLD) {
    return {
      signal: {
        code: config.RULE_CODES.HIGH_VALUE_TRANSACTION,
        description: `Transaction amount ($${amount.toFixed(2)}) exceeds the high-value baseline threshold ($${config.THRESHOLDS.HIGH_VALUE_THRESHOLD.toFixed(2)}).`,
        severity: config.SEVERITIES.HIGH,
        confidence: config.CONFIDENCE.RULE_CONFIDENCE,
      },
      ruleMatch: {
        rule: config.RULE_CODES.HIGH_VALUE_TRANSACTION,
        ruleId: config.RULE_CODES.HIGH_VALUE_TRANSACTION,
        ruleName: 'High Transaction Value',
        points: config.POINTS.HIGH_VALUE_POINTS,
        action: 'ADD_POINTS',
        triggered: true,
        reason: `Transaction amount ($${amount.toFixed(2)}) meets or exceeds high-value threshold of $${config.THRESHOLDS.HIGH_VALUE_THRESHOLD.toFixed(2)}.`,
      },
    };
  }
  return null;
}

/**
 * Evaluates Rule 2: Elevated / Medium Transaction Value.
 * Triggers when transaction amount is at or above the medium threshold but below the high threshold.
 * Hardened against non-finite values (NaN, Infinity, -Infinity).
 *
 * @param {Object} transaction - Transaction data
 * @param {Object} [config] - Injected risk configuration
 * @returns {Object|null} Rule evaluation result or null if not triggered
 */
function evaluateMediumValue(transaction, config = riskConfig) {
  const amount = Number(transaction.amount);
  if (
    Number.isFinite(amount) &&
    amount >= config.THRESHOLDS.MEDIUM_VALUE_THRESHOLD &&
    amount < config.THRESHOLDS.HIGH_VALUE_THRESHOLD
  ) {
    return {
      signal: {
        code: config.RULE_CODES.ELEVATED_TRANSACTION_VALUE,
        description: `Transaction amount ($${amount.toFixed(2)}) falls within the elevated risk threshold range ($${config.THRESHOLDS.MEDIUM_VALUE_THRESHOLD.toFixed(2)} - $${config.THRESHOLDS.HIGH_VALUE_THRESHOLD.toFixed(2)}).`,
        severity: config.SEVERITIES.MEDIUM,
        confidence: config.CONFIDENCE.RULE_CONFIDENCE,
      },
      ruleMatch: {
        rule: config.RULE_CODES.ELEVATED_TRANSACTION_VALUE,
        ruleId: config.RULE_CODES.ELEVATED_TRANSACTION_VALUE,
        ruleName: 'Elevated Transaction Value',
        points: config.POINTS.MEDIUM_VALUE_POINTS,
        action: 'ADD_POINTS',
        triggered: true,
        reason: `Transaction amount ($${amount.toFixed(2)}) is between $${config.THRESHOLDS.MEDIUM_VALUE_THRESHOLD.toFixed(2)} and $${config.THRESHOLDS.HIGH_VALUE_THRESHOLD.toFixed(2)}.`,
      },
    };
  }
  return null;
}

/**
 * Evaluates Rule 3: Customer Information Incomplete.
 * Triggers when primary customer contact identity (email) is absent or empty.
 * Does NOT assume fraud; represents lower confidence in customer identity attribution.
 *
 * @param {Object} transaction - Transaction data
 * @param {Object} [config] - Injected risk configuration
 * @returns {Object|null} Rule evaluation result or null if not triggered
 */
function evaluateCustomerIncomplete(transaction, config = riskConfig) {
  const customer = transaction.customer;
  const hasEmail = Boolean(
    customer &&
    typeof customer.email === 'string' &&
    customer.email.trim().length > 0
  );

  if (!hasEmail) {
    return {
      signal: {
        code: config.RULE_CODES.CUSTOMER_INFORMATION_INCOMPLETE,
        description: 'Customer contact information is incomplete (missing primary email address).',
        severity: config.SEVERITIES.LOW,
        confidence: config.CONFIDENCE.RULE_CONFIDENCE,
      },
      ruleMatch: {
        rule: config.RULE_CODES.CUSTOMER_INFORMATION_INCOMPLETE,
        ruleId: config.RULE_CODES.CUSTOMER_INFORMATION_INCOMPLETE,
        ruleName: 'Customer Information Incomplete',
        points: config.POINTS.CUSTOMER_INCOMPLETE_POINTS,
        action: 'ADD_POINTS',
        triggered: true,
        reason: 'Customer object is absent or missing a valid email address.',
      },
    };
  }
  return null;
}

/**
 * RULE 4 — INTERNATIONAL ISSUER (INTENTIONALLY SKIPPED)
 *
 * Rationale:
 * While the Transaction model stores `paymentMethod.issuerCountry`, neither the
 * Transaction model nor the Merchant model currently defines the merchant's domestic
 * operating country.
 *
 * In accordance with Phase 2H design guidelines ("If the Transaction model does not
 * contain sufficient merchant-country information, DO NOT invent it. Instead, skip
 * this rule and document why"), this rule is documented and skipped.
 */
const RULE_4_INTERNATIONAL_ISSUER_STATUS = Object.freeze({
  rule: 'INTERNATIONAL_ISSUER',
  status: 'SKIPPED',
  reason: 'Neither Transaction nor Merchant schema specifies merchant domestic country. Rule skipped to prevent false assumptions.',
});

/**
 * Evaluates Rule 5: Cart Total Mismatch.
 * Triggers if transaction has cart items and their calculated total differs from
 * transaction.amount beyond the allowable rounding tolerance.
 * Hardened against floating-point precision artifacts and non-finite numbers.
 *
 * @param {Object} transaction - Transaction data
 * @param {Object} [config] - Injected risk configuration
 * @returns {Object|null} Rule evaluation result or null if not triggered
 */
function evaluateCartMismatch(transaction, config = riskConfig) {
  const cartItems = transaction.cartItems;
  const transactionAmount = Number(transaction.amount);

  if (!Number.isFinite(transactionAmount) || transactionAmount < 0) {
    return null;
  }

  if (Array.isArray(cartItems) && cartItems.length > 0) {
    let calculatedTotal = 0;
    for (const item of cartItems) {
      const price = Number(item.price);
      const quantity = Number(item.quantity);
      if (!Number.isFinite(price) || !Number.isFinite(quantity) || price < 0 || quantity < 0) {
        return null;
      }
      calculatedTotal += price * quantity;
    }

    const difference = Math.abs(calculatedTotal - transactionAmount);
    // Round difference to 4 decimal places to prevent float epsilon false positives (e.g. 0.010000000000000009)
    const roundedDifference = Math.round(difference * 10000) / 10000;

    if (roundedDifference > config.THRESHOLDS.CART_MISMATCH_TOLERANCE) {
      return {
        signal: {
          code: config.RULE_CODES.CART_TOTAL_MISMATCH,
          description: `Calculated cart total ($${calculatedTotal.toFixed(2)}) differs from transaction amount ($${transactionAmount.toFixed(2)}).`,
          severity: config.SEVERITIES.HIGH,
          confidence: config.CONFIDENCE.RULE_CONFIDENCE,
        },
        ruleMatch: {
          rule: config.RULE_CODES.CART_TOTAL_MISMATCH,
          ruleId: config.RULE_CODES.CART_TOTAL_MISMATCH,
          ruleName: 'Cart Total Mismatch',
          points: config.POINTS.CART_MISMATCH_POINTS,
          action: 'ADD_POINTS',
          triggered: true,
          reason: `Calculated cart total ($${calculatedTotal.toFixed(2)}) does not match transaction amount ($${transactionAmount.toFixed(2)}) within $${config.THRESHOLDS.CART_MISMATCH_TOLERANCE} tolerance.`,
        },
      };
    }
  }
  return null;
}

/**
 * Evaluates Rule 6: Large Item Quantity.
 * Triggers if any cart item has a quantity at or above the configured large-quantity threshold.
 * Hardened against non-finite values.
 *
 * @param {Object} transaction - Transaction data
 * @param {Object} [config] - Injected risk configuration
 * @returns {Object|null} Rule evaluation result or null if not triggered
 */
function evaluateLargeQuantity(transaction, config = riskConfig) {
  const cartItems = transaction.cartItems;
  if (Array.isArray(cartItems) && cartItems.length > 0) {
    const largeItem = cartItems.find((item) => {
      const qty = Number(item.quantity);
      return Number.isFinite(qty) && qty >= config.THRESHOLDS.LARGE_ITEM_QUANTITY_THRESHOLD;
    });

    if (largeItem) {
      const itemTitle = largeItem.title || 'Item';
      return {
        signal: {
          code: config.RULE_CODES.LARGE_ITEM_QUANTITY,
          description: `Cart contains an item ('${itemTitle}') with quantity (${largeItem.quantity}) meeting or exceeding threshold (${config.THRESHOLDS.LARGE_ITEM_QUANTITY_THRESHOLD}).`,
          severity: config.SEVERITIES.MEDIUM,
          confidence: config.CONFIDENCE.RULE_CONFIDENCE,
        },
        ruleMatch: {
          rule: config.RULE_CODES.LARGE_ITEM_QUANTITY,
          ruleId: config.RULE_CODES.LARGE_ITEM_QUANTITY,
          ruleName: 'Large Item Quantity',
          points: config.POINTS.LARGE_ITEM_QUANTITY_POINTS,
          action: 'ADD_POINTS',
          triggered: true,
          reason: `Item '${itemTitle}' quantity (${largeItem.quantity}) meets or exceeds threshold of ${config.THRESHOLDS.LARGE_ITEM_QUANTITY_THRESHOLD}.`,
        },
      };
    }
  }
  return null;
}

module.exports = {
  evaluateHighValue,
  evaluateMediumValue,
  evaluateCustomerIncomplete,
  evaluateCartMismatch,
  evaluateLargeQuantity,
  RULE_4_INTERNATIONAL_ISSUER_STATUS,
};
