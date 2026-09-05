const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const riskConfig = require('../src/config/riskConfig');
const { calculateRisk, enforceRiskInvariants } = require('../src/services/riskService');
const {
  evaluateHighValue,
  evaluateMediumValue,
  evaluateCustomerIncomplete,
  evaluateCartMismatch,
  evaluateLargeQuantity,
  RULE_4_INTERNATIONAL_ISSUER_STATUS,
} = require('../src/services/riskRules');

describe('DETERMINISTIC RISK ENGINE — UNIT & HARDENING TESTS', () => {
  // =========================================================================
  // 1. ZERO-RISK TRANSACTIONS
  // =========================================================================
  describe('1. Zero-Risk Transactions', () => {
    it('Transaction with no triggered rules produces score 0, LOW tier, APPROVE, empty signals/matches', () => {
      const tx = {
        amount: 45.0,
        currency: 'USD',
        customer: { email: 'safe.shopper@merchant.com', phone: '+12025550199' },
        cartItems: [
          { title: 'Standard Item', price: 15.0, quantity: 3 },
        ],
      };

      const result = calculateRisk(tx);

      assert.equal(result.riskScore, 0);
      assert.equal(result.riskTier, 'LOW');
      assert.equal(result.recommendation, 'APPROVE');
      assert.deepEqual(result.signals, []);
      assert.deepEqual(result.ruleMatches, []);
    });

    it('Empty transaction object produces safe zero-risk default without crashing', () => {
      const result = calculateRisk({});
      assert.equal(result.riskScore, 15); // Customer is incomplete because no customer object exists
      assert.equal(result.riskTier, 'LOW');
      assert.equal(result.recommendation, 'APPROVE');
    });

    it('Null or non-object transaction safely defaults to 0 score without exceptions', () => {
      assert.equal(calculateRisk(null).riskScore, 0);
      assert.equal(calculateRisk(undefined).riskScore, 0);
      assert.equal(calculateRisk('invalid').riskScore, 0);
    });
  });

  // =========================================================================
  // 2. INPUT IMMUTABILITY
  // =========================================================================
  describe('2. Input Immutability', () => {
    it('calculateRisk does not mutate transaction object or any nested properties', () => {
      const original = {
        _id: '64a1b2c3d4e5f6a7b8c9d001',
        merchantId: '507f1f77bcf86cd799439011',
        amount: 1500.0,
        currency: 'USD',
        customer: {
          email: 'alice@domain.com',
          phone: '+15551234567',
          billingAddress: { city: 'New York', country: 'US' },
        },
        cartItems: [
          { title: 'Monitor', price: 500.0, quantity: 2 },
          { title: 'Cable', price: 25.0, quantity: 1 },
        ],
      };

      // Deep clone before execution
      const snapshot = JSON.parse(JSON.stringify(original));

      // Execute risk engine
      const result = calculateRisk(original);

      // Verify execution produced non-trivial output
      assert.ok(result.riskScore > 0);

      // Verify original object is completely identical to snapshot
      assert.deepEqual(original, snapshot);
      assert.equal(original.amount, 1500.0);
      assert.equal(original.cartItems.length, 2);
      assert.equal(original.cartItems[0].quantity, 2);
    });
  });

  // =========================================================================
  // 3. NUMERIC EDGE CASES & DEFENSIVE HARDENING
  // =========================================================================
  describe('3. Numeric Edge Cases & Defensive Hardening', () => {
    it('amount = 0: Evaluates without crashing and does not trigger high/elevated value', () => {
      const tx = { amount: 0, customer: { email: 'zero@test.com' } };
      const res = calculateRisk(tx);
      assert.equal(res.riskScore, 0);
      assert.equal(res.riskTier, 'LOW');
    });

    it('amount = 0.01: Micro-transaction evaluates cleanly', () => {
      const tx = { amount: 0.01, customer: { email: 'micro@test.com' } };
      const res = calculateRisk(tx);
      assert.equal(res.riskScore, 0);
      assert.equal(res.riskTier, 'LOW');
    });

    it('amount = 1000000000: Very large amount triggers HIGH_VALUE_TRANSACTION cleanly without overflow', () => {
      const tx = { amount: 1000000000, customer: { email: 'whale@test.com' } };
      const res = calculateRisk(tx);
      assert.equal(res.riskScore, 40);
      assert.equal(res.riskTier, 'MEDIUM');
      assert.equal(res.signals[0].code, 'HIGH_VALUE_TRANSACTION');
    });

    it('amount = NaN, Infinity, -Infinity are defensively ignored and never corrupt score', () => {
      assert.equal(evaluateHighValue({ amount: NaN }), null);
      assert.equal(evaluateHighValue({ amount: Infinity }), null);
      assert.equal(evaluateHighValue({ amount: -Infinity }), null);
      assert.equal(evaluateMediumValue({ amount: NaN }), null);
      assert.equal(evaluateMediumValue({ amount: Infinity }), null);
      assert.equal(evaluateCartMismatch({ amount: NaN, cartItems: [{ price: 10, quantity: 1 }] }), null);
    });

    it('cart quantity edge cases (1, 9, 10): 10 triggers LARGE_ITEM_QUANTITY, 1 and 9 do not', () => {
      assert.equal(evaluateLargeQuantity({ cartItems: [{ price: 10, quantity: 1 }] }), null);
      assert.equal(evaluateLargeQuantity({ cartItems: [{ price: 10, quantity: 9 }] }), null);
      const triggered = evaluateLargeQuantity({ cartItems: [{ price: 10, quantity: 10 }] });
      assert.ok(triggered);
      assert.equal(triggered.ruleMatch.rule, 'LARGE_ITEM_QUANTITY');
    });

    it('floating-point cart calculations around $0.01 tolerance are strictly respected', () => {
      // Exactly $0.01 difference: difference <= 0.01 -> NO MISMATCH
      const txExactTolerance = {
        amount: 100.0,
        cartItems: [{ price: 100.01, quantity: 1 }],
      };
      assert.equal(evaluateCartMismatch(txExactTolerance), null);

      // Float representation of $0.01 difference (e.g. 100.00 vs 99.99): diff = 0.01 -> NO MISMATCH
      const txFloatPoint1 = {
        amount: 100.0,
        cartItems: [{ price: 33.33, quantity: 3 }], // 99.99
      };
      assert.equal(evaluateCartMismatch(txFloatPoint1), null);

      // $0.011 difference (above $0.01 tolerance) -> TRIGGERS MISMATCH
      const txOverTolerance = {
        amount: 100.0,
        cartItems: [{ price: 100.02, quantity: 1 }],
      };
      const mismatch = evaluateCartMismatch(txOverTolerance);
      assert.ok(mismatch);
      assert.equal(mismatch.signal.code, 'CART_TOTAL_MISMATCH');
    });
  });

  // =========================================================================
  // 4. EXACT RULE BOUNDARY TESTS
  // =========================================================================
  describe('4. Exact Rule Boundaries', () => {
    describe('High Value Boundaries (threshold: $1,000.00)', () => {
      it('$999.99 does NOT trigger high value', () => {
        assert.equal(evaluateHighValue({ amount: 999.99 }), null);
      });

      it('$1000.00 DOES trigger high value', () => {
        const match = evaluateHighValue({ amount: 1000.0 });
        assert.ok(match);
        assert.equal(match.signal.code, 'HIGH_VALUE_TRANSACTION');
        assert.equal(match.ruleMatch.points, 40);
      });
    });

    describe('Medium Value Boundaries (range: $500.00 to $999.99)', () => {
      it('$499.99 does NOT trigger elevated value', () => {
        assert.equal(evaluateMediumValue({ amount: 499.99 }), null);
      });

      it('$500.00 DOES trigger elevated value', () => {
        const match = evaluateMediumValue({ amount: 500.0 });
        assert.ok(match);
        assert.equal(match.signal.code, 'ELEVATED_TRANSACTION_VALUE');
        assert.equal(match.ruleMatch.points, 20);
      });

      it('$999.99 DOES trigger elevated value', () => {
        const match = evaluateMediumValue({ amount: 999.99 });
        assert.ok(match);
        assert.equal(match.signal.code, 'ELEVATED_TRANSACTION_VALUE');
        assert.equal(match.ruleMatch.points, 20);
      });

      it('$1000.00 does NOT trigger elevated value (escalates to High Value)', () => {
        assert.equal(evaluateMediumValue({ amount: 1000.0 }), null);
      });
    });

    describe('Large Item Quantity Boundaries (threshold: 10)', () => {
      it('Quantity 9 does NOT trigger large quantity', () => {
        assert.equal(evaluateLargeQuantity({ cartItems: [{ price: 5, quantity: 9 }] }), null);
      });

      it('Quantity 10 DOES trigger large quantity', () => {
        const match = evaluateLargeQuantity({ cartItems: [{ price: 5, quantity: 10 }] });
        assert.ok(match);
        assert.equal(match.signal.code, 'LARGE_ITEM_QUANTITY');
        assert.equal(match.ruleMatch.points, 20);
      });
    });

    describe('Cart Mismatch Boundaries (tolerance: $0.01)', () => {
      it('Difference <= 0.01 does NOT trigger mismatch', () => {
        assert.equal(evaluateCartMismatch({ amount: 50.0, cartItems: [{ price: 50.01, quantity: 1 }] }), null);
      });

      it('Difference > 0.01 DOES trigger mismatch', () => {
        const match = evaluateCartMismatch({ amount: 50.0, cartItems: [{ price: 50.02, quantity: 1 }] });
        assert.ok(match);
        assert.equal(match.signal.code, 'CART_TOTAL_MISMATCH');
        assert.equal(match.ruleMatch.points, 35);
      });
    });

    describe('Customer Identity Boundaries', () => {
      it('Valid customer.email does NOT trigger incomplete customer', () => {
        assert.equal(evaluateCustomerIncomplete({ customer: { email: 'valid@test.com' } }), null);
      });

      it('Missing customer object DOES trigger incomplete customer', () => {
        const match = evaluateCustomerIncomplete({});
        assert.ok(match);
        assert.equal(match.signal.code, 'CUSTOMER_INFORMATION_INCOMPLETE');
        assert.equal(match.ruleMatch.points, 15);
      });

      it('Customer without email DOES trigger incomplete customer', () => {
        const match = evaluateCustomerIncomplete({ customer: { phone: '+1234567890' } });
        assert.ok(match);
        assert.equal(match.signal.code, 'CUSTOMER_INFORMATION_INCOMPLETE');
      });

      it('Customer with empty or whitespace email DOES trigger incomplete customer', () => {
        assert.ok(evaluateCustomerIncomplete({ customer: { email: '' } }));
        assert.ok(evaluateCustomerIncomplete({ customer: { email: '   ' } }));
      });
    });
  });

  // =========================================================================
  // 5. MULTIPLE RULE COMBINATIONS
  // =========================================================================
  describe('5. Multiple Rule Combinations', () => {
    it('$600 + incomplete customer: 20 + 15 = 35 -> MEDIUM -> REVIEW', () => {
      const tx = {
        amount: 600.0,
        customer: {},
        cartItems: [{ title: 'Item', price: 600.0, quantity: 1 }],
      };
      const result = calculateRisk(tx);

      assert.equal(result.riskScore, 35);
      assert.equal(result.riskTier, 'MEDIUM');
      assert.equal(result.recommendation, 'REVIEW');
      assert.equal(result.signals.length, 2);
      assert.equal(result.ruleMatches.length, 2);
      assert.equal(result.signals[0].code, 'ELEVATED_TRANSACTION_VALUE');
      assert.equal(result.signals[1].code, 'CUSTOMER_INFORMATION_INCOMPLETE');
    });

    it('$1000 + incomplete customer: 40 + 15 = 55 -> MEDIUM -> REVIEW', () => {
      const tx = {
        amount: 1000.0,
        customer: {},
        cartItems: [{ title: 'Item', price: 1000.0, quantity: 1 }],
      };
      const result = calculateRisk(tx);

      assert.equal(result.riskScore, 55);
      assert.equal(result.riskTier, 'MEDIUM');
      assert.equal(result.recommendation, 'REVIEW');
      assert.equal(result.signals.length, 2);
      assert.equal(result.signals[0].code, 'HIGH_VALUE_TRANSACTION');
      assert.equal(result.signals[1].code, 'CUSTOMER_INFORMATION_INCOMPLETE');
    });

    it('$1500 + cart mismatch: 40 + 35 = 75 -> HIGH -> DECLINE', () => {
      const tx = {
        amount: 1500.0,
        customer: { email: 'verified@buyer.com' },
        cartItems: [{ title: 'Item', price: 500.0, quantity: 1 }], // Cart = $500 vs $1500 amount
      };
      const result = calculateRisk(tx);

      assert.equal(result.riskScore, 75);
      assert.equal(result.riskTier, 'HIGH');
      assert.equal(result.recommendation, 'DECLINE');
      assert.equal(result.signals.length, 2);
      assert.equal(result.signals[0].code, 'HIGH_VALUE_TRANSACTION');
      assert.equal(result.signals[1].code, 'CART_TOTAL_MISMATCH');
    });

    it('$1500 + cart mismatch + large quantity: 40 + 35 + 20 = 95 -> HIGH -> DECLINE', () => {
      const tx = {
        amount: 1500.0,
        customer: { email: 'verified@buyer.com' },
        cartItems: [
          { title: 'Bulk Cable', price: 10.0, quantity: 20 }, // Qty 20 (+20), sum = $200 vs $1500 (+35)
        ],
      };
      const result = calculateRisk(tx);

      assert.equal(result.riskScore, 95);
      assert.equal(result.riskTier, 'HIGH');
      assert.equal(result.recommendation, 'DECLINE');
      assert.equal(result.signals.length, 3);
      assert.equal(result.ruleMatches.length, 3);
      assert.equal(result.signals[0].code, 'HIGH_VALUE_TRANSACTION');
      assert.equal(result.signals[1].code, 'CART_TOTAL_MISMATCH');
      assert.equal(result.signals[2].code, 'LARGE_ITEM_QUANTITY');
    });

    it('No rule is counted twice; every signal has corresponding ruleMatch', () => {
      const tx = {
        amount: 2500.0,
        customer: {},
        cartItems: [
          { title: 'Item', price: 50.0, quantity: 15 },
        ],
      };
      const result = calculateRisk(tx);

      const ruleCodes = result.ruleMatches.map((r) => r.rule);
      const uniqueRuleCodes = new Set(ruleCodes);
      assert.equal(ruleCodes.length, uniqueRuleCodes.size, 'No rule should be counted twice');
      assert.equal(result.signals.length, result.ruleMatches.length);
    });
  });

  // =========================================================================
  // 6. SERVICE-LEVEL INVARIANT SAFEGUARDS
  // =========================================================================
  describe('6. Service-Level Invariant Safeguards', () => {
    it('Accepts completely consistent risk assessment attributes', () => {
      assert.doesNotThrow(() => {
        enforceRiskInvariants(0, 'LOW', 'APPROVE', 0, null);
        enforceRiskInvariants(35, 'MEDIUM', 'REVIEW', 35, null);
        enforceRiskInvariants(75, 'HIGH', 'DECLINE', 75, null);
      });
    });

    it('Rejects non-integer or out-of-range riskScore', () => {
      assert.throws(() => enforceRiskInvariants(35.5, 'MEDIUM', 'REVIEW', 35.5, null), /integer/);
      assert.throws(() => enforceRiskInvariants(-5, 'LOW', 'APPROVE', -5, null), /between 0 and 100/);
      assert.throws(() => enforceRiskInvariants(105, 'HIGH', 'DECLINE', 105, null), /between 0 and 100/);
    });

    it('Rejects mismatched riskTier', () => {
      assert.throws(() => enforceRiskInvariants(10, 'HIGH', 'DECLINE', 10, null), /does not match score/);
      assert.throws(() => enforceRiskInvariants(75, 'LOW', 'APPROVE', 75, null), /does not match score/);
    });

    it('Rejects mismatched recommendation', () => {
      assert.throws(() => enforceRiskInvariants(10, 'LOW', 'DECLINE', 10, null), /does not match tier/);
      assert.throws(() => enforceRiskInvariants(80, 'HIGH', 'APPROVE', 80, null), /does not match tier/);
    });

    it('Rejects mismatched baselineScore', () => {
      assert.throws(() => enforceRiskInvariants(20, 'LOW', 'APPROVE', 50, null), /must equal riskScore/);
    });

    it('Rejects non-null aiScore in deterministic baseline', () => {
      assert.throws(() => enforceRiskInvariants(20, 'LOW', 'APPROVE', 20, 85), /aiScore must remain null/);
    });
  });
});
