/**
 * Centralized configuration for the deterministic baseline risk engine.
 * Eliminates magic numbers across rules, scoring, tiers, and recommendations.
 */

const THRESHOLDS = Object.freeze({
  /** Transactions at or above this amount trigger the HIGH_VALUE_TRANSACTION rule */
  HIGH_VALUE_THRESHOLD: 1000.0,
  /** Transactions at or above this amount and below HIGH_VALUE_THRESHOLD trigger ELEVATED_TRANSACTION_VALUE */
  MEDIUM_VALUE_THRESHOLD: 500.0,
  /** Any single cart item with quantity at or above this triggers LARGE_ITEM_QUANTITY */
  LARGE_ITEM_QUANTITY_THRESHOLD: 10,
  /** Allowed currency tolerance for rounding discrepancies between cart sum and transaction amount */
  CART_MISMATCH_TOLERANCE: 0.01,
});

const POINTS = Object.freeze({
  HIGH_VALUE_POINTS: 40,
  MEDIUM_VALUE_POINTS: 20,
  CUSTOMER_INCOMPLETE_POINTS: 15,
  CART_MISMATCH_POINTS: 35,
  LARGE_ITEM_QUANTITY_POINTS: 20,
});

const TIERS = Object.freeze({
  LOW: Object.freeze({ min: 0, max: 29 }),
  MEDIUM: Object.freeze({ min: 30, max: 69 }),
  HIGH: Object.freeze({ min: 70, max: 100 }),
});

const TIER_RECOMMENDATIONS = Object.freeze({
  LOW: 'APPROVE',
  MEDIUM: 'REVIEW',
  HIGH: 'DECLINE',
});

const SEVERITIES = Object.freeze({
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
});

const CONFIDENCE = Object.freeze({
  /**
   * Deterministic rule confidence.
   * Explicitly represents rule adherence confidence (1.0), NOT a statistical fraud probability.
   */
  RULE_CONFIDENCE: 1.0,
});

const RULE_CODES = Object.freeze({
  HIGH_VALUE_TRANSACTION: 'HIGH_VALUE_TRANSACTION',
  ELEVATED_TRANSACTION_VALUE: 'ELEVATED_TRANSACTION_VALUE',
  CUSTOMER_INFORMATION_INCOMPLETE: 'CUSTOMER_INFORMATION_INCOMPLETE',
  CART_TOTAL_MISMATCH: 'CART_TOTAL_MISMATCH',
  LARGE_ITEM_QUANTITY: 'LARGE_ITEM_QUANTITY',
  INTERNATIONAL_ISSUER: 'INTERNATIONAL_ISSUER',
});

module.exports = {
  THRESHOLDS,
  POINTS,
  TIERS,
  TIER_RECOMMENDATIONS,
  SEVERITIES,
  CONFIDENCE,
  RULE_CODES,
};
