const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const riskConfig = require('../src/config/riskConfig');
const { calculateRisk } = require('../src/services/riskService');
const {
  evaluateHighValue,
  evaluateMediumValue,
  evaluateCustomerIncomplete,
  evaluateCartMismatch,
  evaluateLargeQuantity,
  RULE_4_INTERNATIONAL_ISSUER_STATUS,
} = require('../src/services/riskRules');

describe('DETERMINISTIC RISK ENGINE — UNIT TESTS', () => {
  // =========================================================================
  // A. BASIC SCORING
  // =========================================================================
  describe('A. Basic Scoring Profiles', () => {
    it('Low-risk transaction: standard amount, valid customer, matching cart yields LOW tier & APPROVE', () => {
      const tx = {
        amount: 50.0,
        currency: 'USD',
        customer: {
          email: 'customer@example.com',
          phone: '+15551234567',
        },
        cartItems: [
          { title: 'Book', price: 25.0, quantity: 2 },
        ],
      };

      const result = calculateRisk(tx);

      assert.equal(result.riskScore, 0);
      assert.equal(result.riskTier, 'LOW');
      assert.equal(result.recommendation, 'APPROVE');
      assert.equal(result.signals.length, 0);
      assert.equal(result.ruleMatches.length, 0);
    });

    it('Medium-risk transaction: elevated amount ($600) + missing customer email yields MEDIUM tier & REVIEW', () => {
      const tx = {
        amount: 600.0,
        currency: 'USD',
        customer: {}, // Missing email
        cartItems: [
          { title: 'Headphones', price: 600.0, quantity: 1 },
        ],
      };

      const result = calculateRisk(tx);

      // Elevated value: +20, Customer incomplete: +15 -> 35
      assert.equal(result.riskScore, 35);
      assert.equal(result.riskTier, 'MEDIUM');
      assert.equal(result.recommendation, 'REVIEW');
      assert.equal(result.signals.length, 2);
      assert.equal(result.ruleMatches.length, 2);
    });

    it('High-risk transaction: high amount ($1200) + cart mismatch ($1200 vs $400) yields HIGH tier & DECLINE', () => {
      const tx = {
        amount: 1200.0,
        currency: 'USD',
        customer: { email: 'buyer@example.com' },
        cartItems: [
          { title: 'Tablet', price: 400.0, quantity: 1 }, // Cart total is $400, but tx amount is $1200
        ],
      };

      const result = calculateRisk(tx);

      // High value: +40, Cart mismatch: +35 -> 75
      assert.equal(result.riskScore, 75);
      assert.equal(result.riskTier, 'HIGH');
      assert.equal(result.recommendation, 'DECLINE');
      assert.equal(result.signals.length, 2);
      assert.equal(result.ruleMatches.length, 2);
    });
  });

  // =========================================================================
  // B. RULE BEHAVIOR
  // =========================================================================
  describe('B. Individual Rule Behavior', () => {
    describe('Rule 1: High Transaction Value', () => {
      it('Triggers when amount exactly equals high threshold ($1000)', () => {
        const tx = { amount: 1000.0, customer: { email: 'test@example.com' } };
        const match = evaluateHighValue(tx);
        assert.ok(match);
        assert.equal(match.signal.code, 'HIGH_VALUE_TRANSACTION');
        assert.equal(match.signal.severity, 'HIGH');
        assert.equal(match.signal.confidence, 1.0);
        assert.equal(match.ruleMatch.rule, 'HIGH_VALUE_TRANSACTION');
        assert.equal(match.ruleMatch.points, 40);
      });

      it('Triggers when amount exceeds high threshold ($2500)', () => {
        const tx = { amount: 2500.0, customer: { email: 'test@example.com' } };
        const match = evaluateHighValue(tx);
        assert.ok(match);
        assert.equal(match.ruleMatch.points, 40);
      });

      it('Does not trigger when amount is below high threshold ($999.99)', () => {
        const tx = { amount: 999.99 };
        const match = evaluateHighValue(tx);
        assert.equal(match, null);
      });
    });

    describe('Rule 2: Elevated / Medium Transaction Value', () => {
      it('Triggers when amount equals medium threshold ($500)', () => {
        const tx = { amount: 500.0 };
        const match = evaluateMediumValue(tx);
        assert.ok(match);
        assert.equal(match.signal.code, 'ELEVATED_TRANSACTION_VALUE');
        assert.equal(match.signal.severity, 'MEDIUM');
        assert.equal(match.signal.confidence, 1.0);
        assert.equal(match.ruleMatch.points, 20);
      });

      it('Triggers when amount is between medium and high threshold ($750)', () => {
        const tx = { amount: 750.0 };
        const match = evaluateMediumValue(tx);
        assert.ok(match);
        assert.equal(match.ruleMatch.points, 20);
      });

      it('Does not trigger when amount meets or exceeds high threshold ($1000)', () => {
        const tx = { amount: 1000.0 };
        const match = evaluateMediumValue(tx);
        assert.equal(match, null);
      });

      it('Does not trigger when amount is below medium threshold ($499.99)', () => {
        const tx = { amount: 499.99 };
        const match = evaluateMediumValue(tx);
        assert.equal(match, null);
      });
    });

    describe('Rule 3: Customer Information Incomplete', () => {
      it('Triggers when customer object is undefined', () => {
        const tx = { amount: 100 };
        const match = evaluateCustomerIncomplete(tx);
        assert.ok(match);
        assert.equal(match.signal.code, 'CUSTOMER_INFORMATION_INCOMPLETE');
        assert.equal(match.signal.severity, 'LOW');
        assert.equal(match.signal.confidence, 1.0);
        assert.equal(match.ruleMatch.points, 15);
      });

      it('Triggers when customer object has no email property', () => {
        const tx = { customer: { phone: '+123456789' } };
        const match = evaluateCustomerIncomplete(tx);
        assert.ok(match);
        assert.equal(match.signal.code, 'CUSTOMER_INFORMATION_INCOMPLETE');
      });

      it('Triggers when customer email is empty whitespace', () => {
        const tx = { customer: { email: '   ' } };
        const match = evaluateCustomerIncomplete(tx);
        assert.ok(match);
      });

      it('Does not trigger when customer has a valid email', () => {
        const tx = { customer: { email: 'alice@merchant.org' } };
        const match = evaluateCustomerIncomplete(tx);
        assert.equal(match, null);
      });
    });

    describe('Rule 4: International Issuer Rationale', () => {
      it('Rule 4 is explicitly documented as SKIPPED due to missing merchant domestic country', () => {
        assert.equal(RULE_4_INTERNATIONAL_ISSUER_STATUS.rule, 'INTERNATIONAL_ISSUER');
        assert.equal(RULE_4_INTERNATIONAL_ISSUER_STATUS.status, 'SKIPPED');
        assert.ok(RULE_4_INTERNATIONAL_ISSUER_STATUS.reason.includes('merchant domestic country'));
      });
    });

    describe('Rule 5: Cart Total Mismatch', () => {
      it('Triggers when calculated cart total differs from transaction amount beyond tolerance', () => {
        const tx = {
          amount: 150.0,
          cartItems: [
            { title: 'Item 1', price: 40.0, quantity: 2 }, // Total = $80.00
          ],
        };
        const match = evaluateCartMismatch(tx);
        assert.ok(match);
        assert.equal(match.signal.code, 'CART_TOTAL_MISMATCH');
        assert.equal(match.signal.severity, 'HIGH');
        assert.equal(match.signal.confidence, 1.0);
        assert.equal(match.ruleMatch.points, 35);
      });

      it('Does not trigger when calculated cart total exactly matches transaction amount', () => {
        const tx = {
          amount: 80.0,
          cartItems: [
            { title: 'Item 1', price: 40.0, quantity: 2 },
          ],
        };
        const match = evaluateCartMismatch(tx);
        assert.equal(match, null);
      });

      it('Does not trigger within acceptable rounding tolerance ($0.01)', () => {
        const tx = {
          amount: 99.99,
          cartItems: [
            { title: 'Item', price: 33.33, quantity: 3 }, // 99.99
          ],
        };
        const match = evaluateCartMismatch(tx);
        assert.equal(match, null);
      });

      it('Does not trigger when transaction has no cartItems array', () => {
        const tx = { amount: 100 };
        const match = evaluateCartMismatch(tx);
        assert.equal(match, null);
      });
    });

    describe('Rule 6: Large Item Quantity', () => {
      it('Triggers when any item quantity meets the threshold (10)', () => {
        const tx = {
          cartItems: [
            { title: 'Bulk Pens', price: 1.0, quantity: 10 },
          ],
        };
        const match = evaluateLargeQuantity(tx);
        assert.ok(match);
        assert.equal(match.signal.code, 'LARGE_ITEM_QUANTITY');
        assert.equal(match.signal.severity, 'MEDIUM');
        assert.equal(match.signal.confidence, 1.0);
        assert.equal(match.ruleMatch.points, 20);
      });

      it('Triggers when any item quantity exceeds the threshold (15)', () => {
        const tx = {
          cartItems: [
            { title: 'Stickers', price: 0.5, quantity: 15 },
          ],
        };
        const match = evaluateLargeQuantity(tx);
        assert.ok(match);
        assert.equal(match.ruleMatch.points, 20);
      });

      it('Does not trigger when all item quantities are below threshold (< 10)', () => {
        const tx = {
          cartItems: [
            { title: 'Shirt', price: 20.0, quantity: 2 },
            { title: 'Socks', price: 5.0, quantity: 9 },
          ],
        };
        const match = evaluateLargeQuantity(tx);
        assert.equal(match, null);
      });

      it('Does not trigger on empty or missing cart', () => {
        assert.equal(evaluateLargeQuantity({ cartItems: [] }), null);
        assert.equal(evaluateLargeQuantity({}), null);
      });
    });
  });

  // =========================================================================
  // C. SCORE PROPERTIES & DETERMINISM
  // =========================================================================
  describe('C. Score Properties, Boundaries, and Determinism', () => {
    it('Score is never below 0', () => {
      const tx = {
        amount: 10,
        customer: { email: 'safe@test.com' },
        cartItems: [{ title: 'Item', price: 10, quantity: 1 }],
      };
      const result = calculateRisk(tx);
      assert.ok(result.riskScore >= 0);
    });

    it('Score is clamped at 100 when multiple rules fire simultaneously', () => {
      // Rule 1: High Value (+40)
      // Rule 3: Customer Incomplete (+15)
      // Rule 5: Cart Mismatch (+35)
      // Rule 6: Large Quantity (+20)
      // Total raw points = 40 + 15 + 35 + 20 = 110 -> Clamped to 100
      const tx = {
        amount: 2000.0,
        customer: {}, // Missing email (+15)
        cartItems: [
          { title: 'Bulk Items', price: 10.0, quantity: 25 }, // Quantity 25 (+20), sum = $250 vs $2000 (+35)
        ],
      };

      const result = calculateRisk(tx);

      assert.equal(result.riskScore, 100);
      assert.equal(result.riskTier, 'HIGH');
      assert.equal(result.recommendation, 'DECLINE');
      assert.equal(result.signals.length, 4);
      assert.equal(result.ruleMatches.length, 4);
    });

    it('Deterministic idempotency: same transaction produces exact same result on repeated runs', () => {
      const tx = {
        amount: 750.0,
        customer: { email: 'repeat@buyer.com' },
        cartItems: [
          { title: 'Gadget', price: 75.0, quantity: 10 },
        ],
      };

      const baseline = calculateRisk(tx);

      for (let i = 0; i < 50; i++) {
        const nextRun = calculateRisk(tx);
        assert.equal(nextRun.riskScore, baseline.riskScore);
        assert.equal(nextRun.riskTier, baseline.riskTier);
        assert.equal(nextRun.recommendation, baseline.recommendation);
        assert.deepEqual(nextRun.signals, baseline.signals);
        assert.deepEqual(nextRun.ruleMatches, baseline.ruleMatches);
      }
    });

    it('Every triggered signal corresponds to a matching ruleMatch', () => {
      const tx = {
        amount: 1200.0,
        customer: {},
      };

      const result = calculateRisk(tx);

      assert.equal(result.signals.length, result.ruleMatches.length);
      for (let i = 0; i < result.signals.length; i++) {
        assert.equal(result.signals[i].code, result.ruleMatches[i].rule);
      }
    });
  });

  // =========================================================================
  // D. RISK TIER MAPPING
  // =========================================================================
  describe('D. Risk Tier Boundaries', () => {
    it('Score 0 to 29 maps to LOW tier', () => {
      // 0 points
      const lowResult0 = calculateRisk({
        amount: 50,
        customer: { email: 'a@b.com' },
        cartItems: [{ title: 'X', price: 50, quantity: 1 }],
      });
      assert.equal(lowResult0.riskTier, 'LOW');

      // 20 points (Medium value alone)
      const lowResult20 = calculateRisk({
        amount: 600,
        customer: { email: 'a@b.com' },
        cartItems: [{ title: 'X', price: 600, quantity: 1 }],
      });
      assert.equal(lowResult20.riskScore, 20);
      assert.equal(lowResult20.riskTier, 'LOW');
    });

    it('Score 30 to 69 maps to MEDIUM tier', () => {
      // 35 points: Medium value (20) + Customer incomplete (15) = 35
      const medResult = calculateRisk({
        amount: 600,
        customer: {},
        cartItems: [{ title: 'X', price: 600, quantity: 1 }],
      });
      assert.equal(medResult.riskScore, 35);
      assert.equal(medResult.riskTier, 'MEDIUM');
    });

    it('Score 70 to 100 maps to HIGH tier', () => {
      // 75 points: High value (40) + Cart mismatch (35) = 75
      const highResult = calculateRisk({
        amount: 1200,
        customer: { email: 'a@b.com' },
        cartItems: [{ title: 'X', price: 100, quantity: 1 }],
      });
      assert.equal(highResult.riskScore, 75);
      assert.equal(highResult.riskTier, 'HIGH');
    });
  });

  // =========================================================================
  // E. RECOMMENDATION MAPPING
  // =========================================================================
  describe('E. Tier-to-Recommendation Mapping', () => {
    it('LOW tier maps to APPROVE', () => {
      assert.equal(riskConfig.TIER_RECOMMENDATIONS.LOW, 'APPROVE');
      const res = calculateRisk({
        amount: 50,
        customer: { email: 'a@b.com' },
      });
      assert.equal(res.recommendation, 'APPROVE');
    });

    it('MEDIUM tier maps to REVIEW', () => {
      assert.equal(riskConfig.TIER_RECOMMENDATIONS.MEDIUM, 'REVIEW');
      const res = calculateRisk({
        amount: 600,
        customer: {},
      });
      assert.equal(res.recommendation, 'REVIEW');
    });

    it('HIGH tier maps to DECLINE', () => {
      assert.equal(riskConfig.TIER_RECOMMENDATIONS.HIGH, 'DECLINE');
      const res = calculateRisk({
        amount: 1500,
        customer: {},
        cartItems: [{ title: 'X', price: 50, quantity: 1 }],
      });
      assert.equal(res.recommendation, 'DECLINE');
    });
  });
});
