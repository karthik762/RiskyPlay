/**
 * Generates a reproducible, labeled held-out dataset of 150 transactions
 * for evaluating RiskyPlay transaction-risk classification.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const categories = ['Electronics', 'Apparel', 'Digital Goods', 'Home & Kitchen', 'Gaming', 'Jewelry'];

const dataset = [];

// 1. 70 APPROVE / LOW-RISK cases
for (let i = 1; i <= 70; i++) {
  const amount = parseFloat((15 + (i * 4.25) % 180).toFixed(2));
  const cat = categories[i % categories.length];
  dataset.push({
    id: `eval_approve_${String(i).padStart(3, '0')}`,
    scenario: `Standard legitimate checkout - ${cat}`,
    groundTruth: 'APPROVE',
    groundTruthTier: 'LOW',
    isFraud: false,
    transaction: {
      amount,
      currency: 'USD',
      customer: {
        customerId: `cust_legit_${1000 + i}`,
        email: `customer${i}@example.com`,
        phone: `+1555010${String(i).padStart(4, '0')}`,
      },
      paymentMethod: {
        cardBin: '411111',
        cardLast4: String(1000 + (i * 7) % 9000),
        cardType: 'CREDIT',
        issuerCountry: 'US',
      },
      cartItems: [
        {
          productId: `prod_${cat.toLowerCase().slice(0, 3)}_${i}`,
          title: `${cat} Standard Item ${i}`,
          price: amount,
          quantity: 1,
          category: cat,
        },
      ],
    },
  });
}

// 2. 45 REVIEW / MEDIUM-RISK cases (30–69 points or borderline edge cases)
for (let i = 1; i <= 45; i++) {
  const variation = i % 4;
  let amount = 650.00;
  let customer;
  let cartItems = [];
  let scenario;

  if (variation === 0) {
    // Medium Value (20 pts) + Customer Incomplete (15 pts) = 35 pts -> REVIEW
    scenario = 'Elevated purchase value with missing customer profile ID';
    amount = 620.00;
    customer = {
      customerId: undefined,
      email: `review_buyer_${i}@example.com`,
    };
    cartItems = [
      {
        productId: `prod_med_${i}`,
        title: `Tablet Device Unit ${i}`,
        price: 620.00,
        quantity: 1,
        category: 'Electronics',
      },
    ];
  } else if (variation === 1) {
    // High Value alone (40 pts) with fully verified customer -> REVIEW
    scenario = 'High single transaction amount with verified customer';
    amount = 1150.00;
    customer = {
      customerId: `cust_verified_${i}`,
      email: `verified_${i}@example.com`,
      phone: `+1555021${String(i).padStart(4, '0')}`,
    };
    cartItems = [
      {
        productId: `prod_hi_${i}`,
        title: `High-End Workstation Laptop ${i}`,
        price: 1150.00,
        quantity: 1,
        category: 'Electronics',
      },
    ];
  } else if (variation === 2) {
    // Cart Mismatch alone (35 pts) -> REVIEW
    scenario = 'Minor item pricing sync discrepancy during promotion';
    amount = 280.00;
    customer = {
      customerId: `cust_reg_${i}`,
      email: `shopper_${i}@example.com`,
    };
    // Cart sum = $200 vs amount = $280
    cartItems = [
      {
        productId: `prod_promo_${i}`,
        title: `Promotional Apparel Item ${i}`,
        price: 100.00,
        quantity: 2,
        category: 'Apparel',
      },
    ];
  } else {
    // Large Item Quantity (>=10: 20 pts) + Customer Incomplete (15 pts) = 35 pts -> REVIEW
    scenario = 'Bulk wholesale quantity with guest checkout';
    amount = 350.00;
    customer = {
      customerId: undefined,
      email: `guest_${i}@outlook.com`,
    };
    cartItems = [
      {
        productId: `prod_bulk_${i}`,
        title: `Accessory Cable Bundle ${i}`,
        price: 35.00,
        quantity: 10,
        category: 'Electronics',
      },
    ];
  }

  // A small fraction represents borderline subtle fraud
  const isFraud = i % 5 === 0;

  dataset.push({
    id: `eval_review_${String(i).padStart(3, '0')}`,
    scenario,
    groundTruth: 'REVIEW',
    groundTruthTier: 'MEDIUM',
    isFraud,
    transaction: {
      amount,
      currency: 'USD',
      customer,
      paymentMethod: {
        cardBin: '424242',
        cardLast4: String(2000 + (i * 9) % 8000),
        cardType: 'CREDIT',
        issuerCountry: 'US',
      },
      cartItems,
    },
  });
}

// 3. 35 DECLINE / HIGH-RISK cases (70–100 points or severe fraud patterns)
for (let i = 1; i <= 35; i++) {
  const variation = i % 3;
  let amount = 1650.00;
  let customer;
  let cartItems = [];
  let scenario;

  if (variation === 0) {
    // High Value (40 pts) + Cart Mismatch (35 pts) = 75 pts -> DECLINE
    scenario = 'High value checkout with critical cart sum discrepancy';
    amount = 1750.00;
    customer = {
      customerId: `cust_anom_${i}`,
      email: `account_${i}@mail.com`,
    };
    // Cart sum = $500 vs amount = $1750
    cartItems = [
      {
        productId: `prod_gift_${i}`,
        title: `Digital Prepaid Card ${i}`,
        price: 250.00,
        quantity: 2,
        category: 'Digital Goods',
      },
    ];
  } else if (variation === 1) {
    // High Value (40 pts) + Large Quantity (20 pts) + Incomplete Customer (15 pts) = 75 pts -> DECLINE
    scenario = 'High value bulk order with missing customer identification';
    amount = 1500.00;
    customer = {
      customerId: undefined,
      email: undefined,
    };
    cartItems = [
      {
        productId: `prod_phone_${i}`,
        title: `Unlocked Smartphone ${i}`,
        price: 150.00,
        quantity: 10,
        category: 'Electronics',
      },
    ];
  } else {
    // High Value (40 pts) + Cart Mismatch (35 pts) + Customer Incomplete (15 pts) = 90 pts -> DECLINE
    scenario = 'Triple anomaly: High value, cart mismatch, and anonymous customer';
    amount = 2400.00;
    customer = {
      customerId: undefined,
      email: undefined,
    };
    cartItems = [
      {
        productId: `prod_lux_${i}`,
        title: `Designer Watch ${i}`,
        price: 600.00,
        quantity: 2,
        category: 'Jewelry',
      },
    ];
  }

  dataset.push({
    id: `eval_decline_${String(i).padStart(3, '0')}`,
    scenario,
    groundTruth: 'DECLINE',
    groundTruthTier: 'HIGH',
    isFraud: true,
    transaction: {
      amount,
      currency: 'USD',
      customer,
      paymentMethod: {
        cardBin: '400000',
        cardLast4: String(8000 + (i * 13) % 1900),
        cardType: 'CREDIT',
        issuerCountry: 'US',
      },
      cartItems,
    },
  });
}

const outputPath = path.join(__dirname, '../dataset/transactions.json');
fs.writeFileSync(outputPath, JSON.stringify(dataset, null, 2), 'utf-8');
console.log(`Generated ${dataset.length} evaluation transactions at ${outputPath}`);
