/**
 * RiskyPlay Demo Database Seed Script.
 *
 * Populates realistic merchants, transactions, risk assessments, chargeback cases,
 * evidence vault items, rebuttal drafts, verification findings, and agent execution traces.
 *
 * Usage:
 *   node scripts/seed.js
 */

'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const env = require('../src/config/env');
const {
  Merchant,
  Transaction,
  RiskAssessment,
  Chargeback,
  Evidence,
  ChargebackResponse,
  AgentTrace,
} = require('../src/models');
const { hashPassword } = require('../src/utils/password');

const MONGODB_URI = process.env.MONGODB_URI || env.MONGODB_URI || 'mongodb://127.0.0.1:27017/riskyplay';

async function seed() {
  console.log(`\nConnecting to MongoDB: ${MONGODB_URI}...`);
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB successfully.');

  const demoEmail = 'demo@riskyplay.com';
  const demoPassword = 'DemoPassword123!';

  // 1. Create or retrieve demo merchant
  let merchant = await Merchant.findOne({ email: demoEmail });
  if (merchant) {
    console.log(`Cleaning existing records for merchant: ${demoEmail}...`);
    const merchantId = merchant._id;
    const txs = await Transaction.find({ merchantId }).select('_id');
    const cbs = await Chargeback.find({ merchantId }).select('_id');
    const entityIds = [...txs.map((t) => t._id), ...cbs.map((c) => c._id)];

    await Promise.all([
      Transaction.deleteMany({ merchantId }),
      RiskAssessment.deleteMany({ merchantId }),
      Chargeback.deleteMany({ merchantId }),
      Evidence.deleteMany({ merchantId }),
      ChargebackResponse.deleteMany({ merchantId }),
      AgentTrace.deleteMany({ entityId: { $in: entityIds } }),
    ]);
  } else {
    console.log(`Creating demo merchant: ${demoEmail}...`);
    const passwordHash = await hashPassword(demoPassword);
    merchant = await Merchant.create({
      name: 'Apex Digital Hardware Store',
      email: demoEmail,
      passwordHash,
    });
  }

  const merchantId = merchant._id;
  console.log(`Merchant ID: ${merchantId}`);

  // 2. Insert transactions across risk tiers conforming to Transaction schema
  const transactionTemplates = [
    // --- LOW RISK (APPROVE) ---
    {
      externalTransactionId: 'TX-2026-001',
      amount: 49.99,
      currency: 'USD',
      status: 'APPROVED',
      customer: {
        customerId: 'CUST-001',
        email: 'sarah.j@example.com',
        ipAddress: '73.189.44.12',
        billingAddress: { street: '742 Evergreen Terrace', city: 'Springfield', state: 'OR', postalCode: '97477', country: 'US' },
        shippingAddress: { street: '742 Evergreen Terrace', city: 'Springfield', state: 'OR', postalCode: '97477', country: 'US' },
      },
      paymentMethod: { cardBin: '411111', cardLast4: '1111', cardType: 'VISA', issuerCountry: 'US' },
      cartItems: [{ productId: 'ITEM-101', title: 'USB-C Fast Cable', price: 49.99, quantity: 1, category: 'Cables' }],
      riskScore: 8,
      riskTier: 'LOW',
      recommendation: 'APPROVE',
    },
    {
      externalTransactionId: 'TX-2026-002',
      amount: 120.0,
      currency: 'USD',
      status: 'APPROVED',
      customer: {
        customerId: 'CUST-002',
        email: 'm.vance@techcorp.io',
        ipAddress: '198.51.100.42',
        billingAddress: { street: '100 Market St, Suite 400', city: 'San Francisco', state: 'CA', postalCode: '94105', country: 'US' },
        shippingAddress: { street: '100 Market St, Suite 400', city: 'San Francisco', state: 'CA', postalCode: '94105', country: 'US' },
      },
      paymentMethod: { cardBin: '550000', cardLast4: '4444', cardType: 'MASTERCARD', issuerCountry: 'US' },
      cartItems: [{ productId: 'ITEM-102', title: 'Wireless Ergonomic Mouse', price: 120.0, quantity: 1, category: 'Peripherals' }],
      riskScore: 12,
      riskTier: 'LOW',
      recommendation: 'APPROVE',
    },
    {
      externalTransactionId: 'TX-2026-003',
      amount: 199.5,
      currency: 'USD',
      status: 'APPROVED',
      customer: {
        customerId: 'CUST-003',
        email: 'elena.rostova@gmail.com',
        ipAddress: '68.195.22.8',
        billingAddress: { street: '450 Lexington Ave', city: 'New York', state: 'NY', postalCode: '10017', country: 'US' },
        shippingAddress: { street: '450 Lexington Ave', city: 'New York', state: 'NY', postalCode: '10017', country: 'US' },
      },
      paymentMethod: { cardBin: '400000', cardLast4: '0002', cardType: 'VISA', issuerCountry: 'US' },
      cartItems: [{ productId: 'ITEM-103', title: 'Noise-Cancelling Earbuds', price: 199.5, quantity: 1, category: 'Audio' }],
      riskScore: 15,
      riskTier: 'LOW',
      recommendation: 'APPROVE',
    },
    {
      externalTransactionId: 'TX-2026-004',
      amount: 89.0,
      currency: 'USD',
      status: 'APPROVED',
      customer: {
        customerId: 'CUST-004',
        email: 'david.kim@stanford.edu',
        ipAddress: '171.67.215.200',
        billingAddress: { street: '450 Serra Mall', city: 'Stanford', state: 'CA', postalCode: '94305', country: 'US' },
        shippingAddress: { street: '450 Serra Mall', city: 'Stanford', state: 'CA', postalCode: '94305', country: 'US' },
      },
      paymentMethod: { cardBin: '424242', cardLast4: '4242', cardType: 'VISA', issuerCountry: 'US' },
      cartItems: [{ productId: 'ITEM-104', title: 'Mechanical Switch Keyboard', price: 89.0, quantity: 1, category: 'Peripherals' }],
      riskScore: 10,
      riskTier: 'LOW',
      recommendation: 'APPROVE',
    },
    {
      externalTransactionId: 'TX-2026-005',
      amount: 245.0,
      currency: 'USD',
      status: 'APPROVED',
      customer: {
        customerId: 'CUST-005',
        email: 'rachel.a@healthnet.org',
        ipAddress: '12.230.88.5',
        billingAddress: { street: '2100 Webster St', city: 'Oakland', state: 'CA', postalCode: '94612', country: 'US' },
        shippingAddress: { street: '2100 Webster St', city: 'Oakland', state: 'CA', postalCode: '94612', country: 'US' },
      },
      paymentMethod: { cardBin: '378282', cardLast4: '0005', cardType: 'AMEX', issuerCountry: 'US' },
      cartItems: [{ productId: 'ITEM-105', title: 'Standing Desk Converter', price: 245.0, quantity: 1, category: 'Furniture' }],
      riskScore: 18,
      riskTier: 'LOW',
      recommendation: 'APPROVE',
    },
    {
      externalTransactionId: 'TX-2026-006',
      amount: 15.99,
      currency: 'USD',
      status: 'APPROVED',
      customer: {
        customerId: 'CUST-006',
        email: 'tom.bradley@yahoo.com',
        ipAddress: '24.12.98.110',
        billingAddress: { street: '12 Oak Ridge Rd', city: 'Denver', state: 'CO', postalCode: '80202', country: 'US' },
        shippingAddress: { street: '12 Oak Ridge Rd', city: 'Denver', state: 'CO', postalCode: '80202', country: 'US' },
      },
      paymentMethod: { cardBin: '411111', cardLast4: '9981', cardType: 'VISA', issuerCountry: 'US' },
      cartItems: [{ productId: 'ITEM-106', title: 'Screen Cleaning Kit', price: 15.99, quantity: 1, category: 'Accessories' }],
      riskScore: 5,
      riskTier: 'LOW',
      recommendation: 'APPROVE',
    },

    // --- MEDIUM RISK (REVIEW) ---
    {
      externalTransactionId: 'TX-2026-007',
      amount: 720.0,
      currency: 'USD',
      status: 'MANUAL_REVIEW',
      customer: {
        customerId: 'CUST-007',
        email: 'alex.wright99@protonmail.com',
        ipAddress: '192.0.2.14',
        billingAddress: { street: '88 King St E', city: 'Toronto', state: 'ON', postalCode: 'M5C 1G5', country: 'CA' },
        shippingAddress: { street: '350 5th Ave', city: 'New York', state: 'NY', postalCode: '10118', country: 'US' },
      },
      paymentMethod: { cardBin: '450000', cardLast4: '8812', cardType: 'VISA', issuerCountry: 'CA' },
      cartItems: [{ productId: 'ITEM-201', title: 'Ultrawide 4K Monitor', price: 720.0, quantity: 1, category: 'Displays' }],
      riskScore: 55,
      riskTier: 'MEDIUM',
      recommendation: 'REVIEW',
    },
    {
      externalTransactionId: 'TX-2026-008',
      amount: 610.0,
      currency: 'USD',
      status: 'MANUAL_REVIEW',
      customer: {
        customerId: 'CUST-008',
        email: 'chloe.dubois@free.fr',
        ipAddress: '82.120.45.10',
        billingAddress: { street: '14 Rue de Rivoli', city: 'Paris', state: 'IDF', postalCode: '75004', country: 'FR' },
        shippingAddress: { street: '14 Rue de Rivoli', city: 'Paris', state: 'IDF', postalCode: '75004', country: 'FR' },
      },
      paymentMethod: { cardBin: '497000', cardLast4: '3310', cardType: 'VISA', issuerCountry: 'FR' },
      cartItems: [{ productId: 'ITEM-202', title: 'Smart Video Conference Bar', price: 610.0, quantity: 1, category: 'Video' }],
      riskScore: 42,
      riskTier: 'MEDIUM',
      recommendation: 'REVIEW',
    },
    {
      externalTransactionId: 'TX-2026-009',
      amount: 850.0,
      currency: 'USD',
      status: 'MANUAL_REVIEW',
      customer: {
        customerId: 'CUST-009',
        email: 'bmiller_temp2026@gmail.com',
        ipAddress: '104.28.19.4',
        billingAddress: { street: '1044 N Michigan Ave', city: 'Chicago', state: 'IL', postalCode: '60611', country: 'US' },
        shippingAddress: { street: 'PO Box 8912', city: 'Gary', state: 'IN', postalCode: '46401', country: 'US' },
      },
      paymentMethod: { cardBin: '510000', cardLast4: '7721', cardType: 'MASTERCARD', issuerCountry: 'US' },
      cartItems: [{ productId: 'ITEM-203', title: 'Portable Generator Pro', price: 850.0, quantity: 1, category: 'Power' }],
      riskScore: 62,
      riskTier: 'MEDIUM',
      recommendation: 'REVIEW',
    },
    {
      externalTransactionId: 'TX-2026-010',
      amount: 540.0,
      currency: 'USD',
      status: 'APPROVED',
      customer: {
        customerId: 'CUST-010',
        email: 'slee_consulting@outlook.com',
        ipAddress: '65.100.80.20',
        billingAddress: { street: '500 Boylston St', city: 'Boston', state: 'MA', postalCode: '02116', country: 'US' },
        shippingAddress: { street: '500 Boylston St', city: 'Boston', state: 'MA', postalCode: '02116', country: 'US' },
      },
      paymentMethod: { cardBin: '400000', cardLast4: '5561', cardType: 'VISA', issuerCountry: 'US' },
      cartItems: [{ productId: 'ITEM-204', title: 'Tablet Drawing Display 16"', price: 540.0, quantity: 1, category: 'Displays' }],
      riskScore: 38,
      riskTier: 'MEDIUM',
      recommendation: 'REVIEW',
    },

    // --- HIGH RISK (DECLINE) ---
    {
      externalTransactionId: 'TX-2026-011',
      amount: 2850.0,
      currency: 'USD',
      status: 'DECLINED',
      customer: {
        customerId: 'CUST-011',
        email: 'burner994827@tempmail.ninja',
        ipAddress: '198.18.0.55',
        billingAddress: { street: '1200 Brickell Ave', city: 'Miami', state: 'FL', postalCode: '33131', country: 'US' },
        shippingAddress: { street: 'Warehouse Bay 4, 99 Freight Way', city: 'Newark', state: 'NJ', postalCode: '07102', country: 'US' },
      },
      paymentMethod: { cardBin: '411111', cardLast4: '0000', cardType: 'VISA', issuerCountry: 'US' },
      cartItems: [
        { productId: 'ITEM-301', title: 'Flagship GPU RTX 4090 OC', price: 1850.0, quantity: 1, category: 'Hardware' },
        { productId: 'ITEM-302', title: 'High Frequency RAM 64GB Kit', price: 500.0, quantity: 2, category: 'Hardware' },
      ],
      riskScore: 88,
      riskTier: 'HIGH',
      recommendation: 'DECLINE',
    },
    {
      externalTransactionId: 'TX-2026-012',
      amount: 3400.0,
      currency: 'USD',
      status: 'DECLINED',
      customer: {
        customerId: 'CUST-012',
        email: 'gramirez88421@guerrillamail.com',
        ipAddress: '103.250.12.1',
        billingAddress: { street: '700 S Flower St', city: 'Los Angeles', state: 'CA', postalCode: '90017', country: 'US' },
        shippingAddress: { street: 'Freight Forwarder Suite B', city: 'Doral', state: 'FL', postalCode: '33122', country: 'US' },
      },
      paymentMethod: { cardBin: '540000', cardLast4: '9901', cardType: 'MASTERCARD', issuerCountry: 'US' },
      cartItems: [{ productId: 'ITEM-303', title: 'Enterprise Core Switch 48-Port', price: 3400.0, quantity: 1, category: 'Networking' }],
      riskScore: 92,
      riskTier: 'HIGH',
      recommendation: 'DECLINE',
    },
    {
      externalTransactionId: 'TX-2026-013',
      amount: 1450.0,
      currency: 'USD',
      status: 'DECLINED',
      customer: {
        customerId: 'CUST-013',
        email: 'vcole_rush@fastmail.fm',
        ipAddress: '185.220.101.5',
        billingAddress: { street: '200 S Biscayne Blvd', city: 'Miami', state: 'FL', postalCode: '33131', country: 'US' },
        shippingAddress: { street: '200 S Biscayne Blvd', city: 'Miami', state: 'FL', postalCode: '33131', country: 'US' },
      },
      paymentMethod: { cardBin: '401288', cardLast4: '1440', cardType: 'VISA', issuerCountry: 'US' },
      cartItems: [{ productId: 'ITEM-304', title: 'Unlocked Flagship Smartphone 512GB', price: 1450.0, quantity: 1, category: 'Mobile' }],
      riskScore: 78,
      riskTier: 'HIGH',
      recommendation: 'DECLINE',
    },
    // --- PRIMARY DEMO SHOWCASE TRANSACTION ---
    {
      externalTransactionId: 'TX-2026-014',
      amount: 1249.99,
      currency: 'USD',
      status: 'APPROVED',
      customer: {
        customerId: 'CUST-014',
        email: 'm.vance@techcorp.io',
        ipAddress: '198.51.100.42',
        billingAddress: { street: '100 Market St, Suite 400', city: 'San Francisco', state: 'CA', postalCode: '94105', country: 'US' },
        shippingAddress: { street: '100 Market St, Suite 400', city: 'San Francisco', state: 'CA', postalCode: '94105', country: 'US' },
      },
      paymentMethod: { cardBin: '550000', cardLast4: '4444', cardType: 'MASTERCARD', issuerCountry: 'US' },
      cartItems: [
        { productId: 'ITEM-401', title: 'Pro Studio Display 27"', price: 999.99, quantity: 1, category: 'Displays' },
        { productId: 'ITEM-402', title: 'Thunderbolt 4 Dock Station', price: 250.0, quantity: 1, category: 'Peripherals' },
      ],
      riskScore: 18,
      riskTier: 'LOW',
      recommendation: 'APPROVE',
    },
  ];

  console.log(`Inserting ${transactionTemplates.length} transactions...`);
  const insertedTxs = [];
  for (const tpl of transactionTemplates) {
    const tx = await Transaction.create({
      merchantId,
      externalTransactionId: tpl.externalTransactionId,
      amount: tpl.amount,
      currency: tpl.currency,
      status: tpl.status,
      customer: tpl.customer,
      paymentMethod: tpl.paymentMethod,
      cartItems: tpl.cartItems,
    });
    insertedTxs.push({ tx, meta: tpl });

    // Create corresponding RiskAssessment
    await RiskAssessment.create({
      transactionId: tx._id,
      merchantId,
      riskScore: tpl.riskScore,
      riskTier: tpl.riskTier,
      recommendation: tpl.recommendation,
      baselineScore: tpl.riskScore,
      aiScore: tpl.riskScore,
      ruleMatches: [
        {
          rule: 'TRANSACTION_VALUE_TIER',
          ruleId: 'VAL-01',
          ruleName: 'Transaction Value Check',
          points: tpl.riskScore > 50 ? 40 : tpl.riskScore > 20 ? 20 : 5,
          reason: `Transaction amount $${tpl.amount} evaluated against merchant thresholds`,
          action: tpl.recommendation,
          triggered: true,
        },
      ],
      signals: [
        {
          code: tpl.riskTier === 'HIGH' ? 'ANOMALOUS_VELOCITY' : 'NORMAL_BEHAVIOR',
          description:
            tpl.riskTier === 'HIGH'
              ? 'Rapid checkout velocity and proxy IP detected'
              : 'Verified customer profile with consistent billing and shipping addresses',
          severity: tpl.riskTier,
          confidence: 0.95,
        },
      ],
      aiAnalysis: {
        status: 'SUCCESS',
        summary:
          tpl.riskTier === 'HIGH'
            ? 'High financial risk due to velocity spikes and non-matching freight forwarding delivery destination.'
            : tpl.riskTier === 'MEDIUM'
            ? 'Moderate risk profile with cross-border billing characteristics requiring secondary verification.'
            : 'Low risk transaction with standard consumer hardware patterns and verified address match.',
        riskFactors: [
          {
            code: tpl.riskTier === 'HIGH' ? 'CART_MISMATCH' : 'ADDRESS_MATCH',
            description:
              tpl.riskTier === 'HIGH'
                ? 'High-value items combined with rapid checkout burst'
                : 'Billing and shipping address line items correspond perfectly',
            severity: tpl.riskTier,
          },
        ],
        aiTier: tpl.riskTier,
        aiRecommendation: tpl.recommendation,
      },
      verification: {
        status: 'VERIFIED',
        scoreDelta: 0,
        tierAgreement: true,
        recommendationAgreement: true,
        warnings: [],
      },
    });
  }

  const primaryTx = insertedTxs.find((t) => t.meta.externalTransactionId === 'TX-2026-014').tx;

  // 3. Create Chargeback Cases
  console.log('Seeding chargeback dispute cases...');

  // --- Showcase Case 1: Primary Demo Dispute ---
  const cb1 = await Chargeback.create({
    merchantId,
    transactionId: primaryTx._id,
    caseNumber: 'CB-2026-8891',
    network: 'VISA',
    reasonCode: '10.4',
    reasonDescription: 'Fraud - Cardholder Does Not Recognize Transaction',
    disputeAmount: 1249.99,
    deadlineDate: new Date(Date.now() + 11 * 86400000),
    status: 'UNDER_REVIEW',
  });

  // --- Case 2: Subscription / Cancellation Dispute ---
  const txSub = insertedTxs[3].tx;
  const cb2 = await Chargeback.create({
    merchantId,
    transactionId: txSub._id,
    caseNumber: 'CB-2026-4412',
    network: 'MASTERCARD',
    reasonCode: '13.6',
    reasonDescription: 'Credit Not Processed / Cancelled Recurring Transaction',
    disputeAmount: 89.0,
    deadlineDate: new Date(Date.now() + 7 * 86400000),
    status: 'OPEN',
  });

  // --- Case 3: Merchant Won Showcase ---
  const txWon = insertedTxs[1].tx;
  const cb3 = await Chargeback.create({
    merchantId,
    transactionId: txWon._id,
    caseNumber: 'CB-2026-1049',
    network: 'VISA',
    reasonCode: '10.4',
    reasonDescription: 'Cardholder Does Not Recognize',
    disputeAmount: 450.0,
    deadlineDate: new Date(Date.now() - 10 * 86400000),
    status: 'WON',
  });

  // --- Case 4: Weak Evidence Showcase (Accept Loss) ---
  const txWeak = insertedTxs[7].tx;
  const cb4 = await Chargeback.create({
    merchantId,
    transactionId: txWeak._id,
    caseNumber: 'CB-2026-9021',
    network: 'VISA',
    reasonCode: '13.3',
    reasonDescription: 'Not As Described or Defective Merchandise',
    disputeAmount: 610.0,
    deadlineDate: new Date(Date.now() + 12 * 86400000),
    status: 'UNDER_REVIEW',
  });

  // 4. Evidence Vault for Primary Showcase Case (cb1)
  console.log('Seeding Evidence Vault items for primary dispute CB-2026-8891...');
  const evOrder = await Evidence.create({
    merchantId,
    chargebackId: cb1._id,
    transactionId: primaryTx._id,
    type: 'ORDER',
    title: 'Customer Order Receipt & Checkout Logs',
    description: 'Digital invoice detailing purchase of Pro Studio Display and Thunderbolt Dock Station.',
    source: 'MERCHANT_SYSTEM',
    fileMetadata: {
      filename: 'invoice_CB20268891.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 104850,
      storageKey: 'vault/invoices/2026/014_inv.pdf',
    },
    extractedFacts: [
      { key: 'orderNumber', value: 'ORD-994821', confidence: 1.0, verified: true },
      { key: 'orderDate', value: '2026-08-28T14:22:10Z', confidence: 1.0, verified: true },
      { key: 'buyerName', value: 'Marcus Vance', confidence: 1.0, verified: true },
      { key: 'buyerEmail', value: 'm.vance@techcorp.io', confidence: 1.0, verified: true },
      { key: 'orderTotal', value: '$1,249.99', confidence: 1.0, verified: true },
      { key: 'ipAddress', value: '198.51.100.42 (San Francisco, CA)', confidence: 1.0, verified: true },
    ],
  });

  const evDelivery = await Evidence.create({
    merchantId,
    chargebackId: cb1._id,
    transactionId: primaryTx._id,
    type: 'DELIVERY',
    title: 'FedEx Priority Signed Delivery Receipt',
    description: 'Direct signature confirmation delivered to registered corporate address.',
    source: 'CARRIER',
    fileMetadata: {
      filename: 'fedex_pod_9928172901.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 254100,
      storageKey: 'vault/carriers/fdx_9928172901.pdf',
    },
    extractedFacts: [
      { key: 'trackingNumber', value: 'FDX-9928172901', confidence: 1.0, verified: true },
      { key: 'carrierStatus', value: 'DELIVERED', confidence: 1.0, verified: true },
      { key: 'deliveryTimestamp', value: '2026-08-31T11:45:00Z', confidence: 1.0, verified: true },
      { key: 'signedBy', value: 'M. Vance (Direct Signature)', confidence: 1.0, verified: true },
      { key: 'gpsCoordinates', value: '37.7928° N, 122.3969° W (Exact match)', confidence: 1.0, verified: true },
    ],
  });

  const evComm = await Evidence.create({
    merchantId,
    chargebackId: cb1._id,
    transactionId: primaryTx._id,
    type: 'COMMUNICATION',
    title: 'Verified Customer Support Chat Transcript',
    description: 'Post-delivery technical support interaction regarding Thunderbolt 4 dock driver setup.',
    source: 'CUSTOMER_SUPPORT',
    fileMetadata: {
      filename: 'support_chat_session_8841.json',
      mimeType: 'application/json',
      sizeBytes: 18200,
      storageKey: 'vault/comms/chat_8841.json',
    },
    extractedFacts: [
      { key: 'customerTicketId', value: 'TCK-88419', confidence: 1.0, verified: true },
      { key: 'interactionDate', value: '2026-09-01T09:12:44Z', confidence: 1.0, verified: true },
      { key: 'verifiedContact', value: 'm.vance@techcorp.io', confidence: 1.0, verified: true },
      { key: 'summary', value: 'Customer confirmed receiving hardware and asked for firmware update link', confidence: 1.0, verified: true },
    ],
  });

  const evTerms = await Evidence.create({
    merchantId,
    chargebackId: cb1._id,
    transactionId: primaryTx._id,
    type: 'CUSTOMER',
    title: 'Terms of Service & Return Policy Electronic Acceptance',
    description: 'Timestamped clickwrap agreement agreeing to merchant dispute and hardware return terms.',
    source: 'SYSTEM',
    fileMetadata: {
      filename: 'tos_consent_vance.log',
      mimeType: 'text/plain',
      sizeBytes: 4200,
      storageKey: 'vault/legal/tos_consent.log',
    },
    extractedFacts: [
      { key: 'consentVersion', value: 'v4.2-2026', confidence: 1.0, verified: true },
      { key: 'consentTimestamp', value: '2026-08-28T14:21:40Z', confidence: 1.0, verified: true },
      { key: 'sha256Hash', value: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', confidence: 1.0, verified: true },
    ],
  });

  // 5. Create Verified Defensive Rebuttal Draft for CB-2026-8891
  console.log('Seeding defensive rebuttal draft and verification findings...');
  const rebuttalResponse = await ChargebackResponse.create({
    merchantId,
    chargebackId: cb1._id,
    transactionId: primaryTx._id,
    responseText: `REPRESENTMENT REBUTTAL NOTICE

Case Number: CB-2026-8891
Dispute Reason: 10.4 (Fraud - Cardholder Does Not Recognize)
Disputed Amount: $1,249.99 USD

To: Dispute Processing Department / Issuing Bank Review Team

Apex Digital Hardware Store respectfully submits documented compelling evidence demonstrating that the transaction in question was authorized, fulfilled, and physically accepted by the registered cardholder, Marcus Vance.

1. TRANSACTION & ORDER AUTHORIZATION [Evidence: ${evOrder._id}]
On August 28, 2026, Marcus Vance placed order #ORD-994821 using verified email m.vance@techcorp.io from IP address 198.51.100.42. The billing address (100 Market St, Suite 400, San Francisco, CA) matched cardholder records with positive AVS match.

2. PROOF OF PHYSICAL DELIVERY WITH DIRECT SIGNATURE [Evidence: ${evDelivery._id}]
The merchandise was dispatched via FedEx Priority under tracking number FDX-9928172901. FedEx records confirm delivery on August 31, 2026, at 11:45 AM to the exact authorized address, with GPS coordinate validation (37.7928° N, 122.3969° W) and direct signature by M. Vance.

3. SUBSEQUENT CUSTOMER ACKNOWLEDGMENT [Evidence: ${evComm._id}]
On September 1, 2026 (24 hours following delivery), the cardholder engaged with customer support under verified ticket TCK-88419 requesting firmware drivers for the Thunderbolt 4 dock, unequivocally confirming receipt and possession of the items.

4. COMPLIANCE WITH RETURN POLICY & TERMS [Evidence: ${evTerms._id}]
Cardholder consented to merchant electronic terms of service prior to purchase. No cancellation or return request was initiated with merchant before filing this claim.

CONCLUSION & REMEDY REQUESTED:
Pursuant to Visa/Mastercard Core Dispute Rules for Reason Code 10.4, proof of delivery to the verified billing address and direct cardholder signature constitutes conclusive rebuttal evidence. We request that the issuing bank reverse this chargeback and credit the merchant account in full ($1,249.99 USD).`,
    responseSummary:
      'Compelling defense supported by signed FedEx delivery proof (M. Vance), verified AVS match, and post-delivery support interaction acknowledging item receipt.',
    keyArguments: [
      {
        claim: 'Merchant possesses proof of delivery with cardholder signature matching the billing address.',
        evidenceIds: [evDelivery._id.toString(), evOrder._id.toString()],
      },
      {
        claim: 'Customer confirmed physical receipt of merchandise via authenticated support ticket.',
        evidenceIds: [evComm._id.toString()],
      },
      {
        claim: 'Electronic agreement terms accepted with positive IP and timestamp audit trail.',
        evidenceIds: [evTerms._id.toString()],
      },
    ],
    evidenceReferences: [
      evOrder._id.toString(),
      evDelivery._id.toString(),
      evComm._id.toString(),
      evTerms._id.toString(),
    ],
    unsupportedClaims: [],
    verification: {
      status: 'VERIFIED',
      warnings: [],
      scoreDelta: 0,
      isGroundingValid: true,
      verifiedAt: new Date(),
    },
    recommendation: 'DEFEND',
    confidence: 94,
    status: 'VERIFIED',
  });

  // 6. Multi-Agent Execution Traces
  console.log('Seeding Multi-Agent Execution Traces...');
  const runIdShowcase = 'run-rebuttal-cb8891';

  await AgentTrace.create([
    {
      runId: runIdShowcase,
      entityType: 'CHARGEBACK_REBUTTAL',
      entityId: cb1._id,
      agentName: 'EVIDENCE',
      stepIndex: 0,
      status: 'COMPLETED',
      inputData: { chargebackId: cb1._id, evidenceCount: 4 },
      reasoning: 'Indexed 4 vault evidence artifacts. Extracted key factual anchors: carrier tracking FDX-9928172901, signature M. Vance, support ticket TCK-88419.',
      outputData: { indexedFactsCount: 18, groundingIndexReady: true },
      modelUsed: 'deterministic-extractor',
      tokensUsed: 0,
      latencyMs: 38,
    },
    {
      runId: runIdShowcase,
      entityType: 'CHARGEBACK_REBUTTAL',
      entityId: cb1._id,
      agentName: 'CHARGEBACK_RESPONSE',
      stepIndex: 1,
      status: 'COMPLETED',
      inputData: { disputeCategory: 'FRAUD', reasonCode: '10.4', evidenceIds: [evOrder._id, evDelivery._id, evComm._id, evTerms._id] },
      reasoning: 'Generated formal defense argument citing strict delivery proof, carrier signature, and subsequent support chat acknowledgment.',
      outputData: { draftId: rebuttalResponse._id, confidenceScore: 94, recommendation: 'DEFEND' },
      modelUsed: 'omniroute:gpt-4o-mini',
      tokensUsed: 1140,
      latencyMs: 1420,
    },
    {
      runId: runIdShowcase,
      entityType: 'CHARGEBACK_REBUTTAL',
      entityId: cb1._id,
      agentName: 'CHARGEBACK_RESPONSE_VERIFICATION',
      stepIndex: 2,
      status: 'COMPLETED',
      inputData: { draftId: rebuttalResponse._id },
      reasoning: 'Evaluated draft against Vault grounding index. Zero hallucinated evidence IDs detected. No ungrounded fraud assertions. Defense claims match carrier records.',
      outputData: { isGroundingValid: true, verificationStatus: 'VERIFIED', warningCount: 0 },
      modelUsed: 'deterministic-guardrail',
      tokensUsed: 0,
      latencyMs: 18,
    },
    {
      runId: runIdShowcase,
      entityType: 'CHARGEBACK_REBUTTAL',
      entityId: cb1._id,
      agentName: 'CHARGEBACK_DECISION',
      stepIndex: 3,
      status: 'COMPLETED',
      inputData: { verificationStatus: 'VERIFIED', recommendation: 'DEFEND', evidenceCount: 4 },
      reasoning: 'Authoritative decision engine evaluated case CB-2026-8891: Evidence threshold satisfied. Decisive representment recommended.',
      outputData: { decision: 'REPRESENT', statusUpdatedTo: 'PENDING_REPRESENTMENT' },
      modelUsed: 'deterministic-decision-engine',
      tokensUsed: 0,
      latencyMs: 12,
    },
  ]);

  console.log('\n======================================================');
  console.log('RISKYPLAY DEMO DATA SEEDING COMPLETE!');
  console.log('======================================================');
  console.log(`Demo Merchant Email:    ${demoEmail}`);
  console.log(`Demo Merchant Password: ${demoPassword}`);
  console.log(`Merchant ID:            ${merchantId}`);
  console.log(`Transactions Seeded:    ${insertedTxs.length}`);
  console.log(`Chargeback Cases:       4`);
  console.log(`Primary Demo Case:      CB-2026-8891 ($1,249.99 USD, INVESTIGATING)`);
  console.log(`Vault Evidence Items:   4 verified items attached`);
  console.log(`Defensive Rebuttal:     VERIFIED, 94% Confidence, Grounded`);
  console.log(`Agent Execution Traces: 4 end-to-end steps recorded`);
  console.log('======================================================\n');

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Seed Error:', err);
  process.exit(1);
});
