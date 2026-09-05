const mongoose = require('mongoose');

const EVIDENCE_TYPES = [
  // Core types
  'ORDER',
  'PAYMENT',
  'CUSTOMER',
  'SHIPPING',
  'DELIVERY',
  'COMMUNICATION',
  'REFUND',
  'PRODUCT',
  'IDENTITY',
  'OTHER',
  // Legacy aliases
  'CARRIER_PROOF',
  'RECEIPT',
  'CUSTOMER_COMMUNICATION',
  'TERMS_ACCEPTANCE',
  'IP_GEOLOCATION',
];

const EVIDENCE_SOURCES = [
  'MERCHANT_SYSTEM',
  'CARRIER',
  'PAYMENT_PROCESSOR',
  'CUSTOMER_SUPPORT',
  'CUSTOMER',
  'MANUAL',
  'SYSTEM',
];

const fileMetadataSchema = new mongoose.Schema(
  {
    filename: { type: String, trim: true },
    mimeType: { type: String, trim: true },
    sizeBytes: {
      type: Number,
      min: [0, 'sizeBytes must be non-negative'],
    },
    storageKey: { type: String, trim: true },
  },
  { _id: false }
);

const legacyMetadataSchema = new mongoose.Schema(
  {
    trackingNumber: { type: String, trim: true },
    carrierStatus: { type: String, trim: true },
    deliveryTimestamp: { type: Date },
    signingParty: { type: String, trim: true },
  },
  { _id: false }
);

const extractedFactSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
    confidence: {
      type: Number,
      min: [0, 'Confidence must be at least 0'],
      max: [1, 'Confidence cannot exceed 1'],
      default: 1.0,
    },
    verified: { type: Boolean, default: false },
  },
  { _id: false }
);

const evidenceSchema = new mongoose.Schema(
  {
    merchantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Merchant',
      required: [true, 'merchantId reference is required'],
      index: true,
    },
    chargebackId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Chargeback',
      required: [true, 'chargebackId reference is required'],
      index: true,
    },
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
      required: [true, 'transactionId reference is required'],
      index: true,
    },
    type: {
      type: String,
      required: [true, 'Evidence type is required'],
      enum: {
        values: EVIDENCE_TYPES,
        message: '{VALUE} is not a valid evidence type',
      },
      index: true,
    },
    title: {
      type: String,
      required: [true, 'title is required'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    source: {
      type: String,
      enum: {
        values: EVIDENCE_SOURCES,
        message: '{VALUE} is not a valid evidence source',
      },
      default: 'MANUAL',
      index: true,
    },
    fileMetadata: fileMetadataSchema,
    // Legacy support fields
    fileName: { type: String, trim: true },
    fileUrl: { type: String, trim: true },
    metadata: legacyMetadataSchema,
    extractedFacts: [extractedFactSchema],
    collectedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for optimal tenant and chargeback lookup performance
evidenceSchema.index({ merchantId: 1, chargebackId: 1 });
evidenceSchema.index({ chargebackId: 1, type: 1 });
evidenceSchema.index({ merchantId: 1, createdAt: -1 });

const Evidence = mongoose.model('Evidence', evidenceSchema);
Evidence.EVIDENCE_TYPES = EVIDENCE_TYPES;
Evidence.EVIDENCE_SOURCES = EVIDENCE_SOURCES;

module.exports = Evidence;

