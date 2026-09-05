const mongoose = require('mongoose');

const RESPONSE_STATUSES = [
  'DRAFT',
  'VERIFIED',
  'VERIFIED_WITH_WARNINGS',
  'REJECTED',
  'APPROVED_FOR_REVIEW',
];

const RECOMMENDATION_VALUES = [
  'DEFEND',
  'DEFEND_WITH_REVIEW',
  'INSUFFICIENT_EVIDENCE',
  'DO_NOT_RECOMMEND_DEFENSE',
];

const keyArgumentSchema = new mongoose.Schema(
  {
    claim: { type: String, required: true, trim: true },
    evidenceIds: [{ type: String, required: true, trim: true }],
  },
  { _id: false }
);

const unsupportedClaimSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, trim: true },
    claim: { type: String, required: true, trim: true },
    severity: {
      type: String,
      enum: ['WARNING', 'ERROR'],
      default: 'WARNING',
    },
    message: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const verificationSubschema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ['DRAFT', 'VERIFIED', 'VERIFIED_WITH_WARNINGS', 'REJECTED', 'AI_UNAVAILABLE'],
      default: 'DRAFT',
    },
    warnings: [
      {
        code: { type: String, required: true },
        message: { type: String, required: true },
        severity: { type: String, default: 'WARNING' },
      },
    ],
    scoreDelta: { type: Number, default: 0 },
    isGroundingValid: { type: Boolean, default: false },
    verifiedAt: { type: Date },
  },
  { _id: false }
);

const chargebackResponseSchema = new mongoose.Schema(
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
    responseText: {
      type: String,
      required: [true, 'responseText is required'],
      trim: true,
    },
    responseSummary: {
      type: String,
      required: [true, 'responseSummary is required'],
      trim: true,
    },
    keyArguments: [keyArgumentSchema],
    evidenceReferences: [{ type: String, trim: true }],
    unsupportedClaims: [unsupportedClaimSchema],
    verification: verificationSubschema,
    recommendation: {
      type: String,
      required: [true, 'recommendation is required'],
      enum: {
        values: RECOMMENDATION_VALUES,
        message: '{VALUE} is not a valid defensive recommendation',
      },
    },
    confidence: {
      type: Number,
      min: [0, 'confidence cannot be negative'],
      max: [100, 'confidence cannot exceed 100'],
      validate: {
        validator: Number.isInteger,
        message: 'confidence must be an integer between 0 and 100',
      },
      default: 50,
    },
    coverage: {
      type: mongoose.Schema.Types.Mixed,
    },
    status: {
      type: String,
      enum: {
        values: RESPONSE_STATUSES,
        message: '{VALUE} is not a valid response status',
      },
      default: 'DRAFT',
      index: true,
    },
    generatedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    reviewedAt: {
      type: Date,
    },
    reviewedBy: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for fast tenant and case retrieval
chargebackResponseSchema.index({ merchantId: 1, chargebackId: 1, createdAt: -1 });
chargebackResponseSchema.index({ chargebackId: 1, createdAt: -1 });

const ChargebackResponse = mongoose.model('ChargebackResponse', chargebackResponseSchema);
ChargebackResponse.RESPONSE_STATUSES = RESPONSE_STATUSES;
ChargebackResponse.RECOMMENDATION_VALUES = RECOMMENDATION_VALUES;

module.exports = ChargebackResponse;
