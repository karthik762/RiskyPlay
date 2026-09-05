const mongoose = require('mongoose');

const CHARGEBACK_STATUSES = [
  'OPEN',
  'UNDER_REVIEW',
  'RESPONSE_READY',
  'SUBMITTED',
  'WON',
  'LOST',
  'CLOSED',
  'RECEIVED',
  'EVIDENCE_GATHERING',
  'RESPONSE_GENERATED',
];

const CHARGEBACK_NETWORKS = ['VISA', 'MASTERCARD', 'AMEX', 'OTHER'];

const ALLOWED_TRANSITIONS = {
  OPEN: ['UNDER_REVIEW', 'CLOSED'],
  UNDER_REVIEW: ['RESPONSE_READY', 'CLOSED'],
  RESPONSE_READY: ['SUBMITTED', 'CLOSED'],
  SUBMITTED: ['WON', 'LOST'],
  WON: ['CLOSED'],
  LOST: ['CLOSED'],
  CLOSED: [],
  // Legacy aliases
  RECEIVED: ['UNDER_REVIEW', 'EVIDENCE_GATHERING', 'CLOSED'],
  EVIDENCE_GATHERING: ['RESPONSE_READY', 'RESPONSE_GENERATED', 'CLOSED'],
  RESPONSE_GENERATED: ['SUBMITTED', 'CLOSED'],
};

const evidenceSummarySchema = new mongoose.Schema(
  {
    evidenceCount: { type: Number, default: 0 },
    coverage: { type: mongoose.Schema.Types.Mixed },
    lastIndexedAt: { type: Date },
  },
  { _id: false }
);

const generatedResponseSchema = new mongoose.Schema(
  {
    narrative: { type: String, trim: true },
    evidenceIndex: [{ type: String, trim: true }],
    generatedAt: { type: Date },
    qaStatus: {
      type: String,
      enum: {
        values: ['PENDING', 'PASSED', 'FAILED'],
        message: '{VALUE} is not a valid qaStatus',
      },
      default: 'PENDING',
    },
  },
  { _id: false }
);

const chargebackSchema = new mongoose.Schema(
  {
    merchantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Merchant',
      required: [true, 'merchantId is required'],
      index: true,
    },
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
      required: [true, 'transactionId is required'],
      index: true,
    },
    caseNumber: {
      type: String,
      required: [true, 'caseNumber is required'],
      trim: true,
    },
    network: {
      type: String,
      required: true,
      enum: {
        values: CHARGEBACK_NETWORKS,
        message: '{VALUE} is not a supported card network',
      },
    },
    reasonCode: {
      type: String,
      required: [true, 'reasonCode is required'],
      trim: true,
    },
    reasonDescription: {
      type: String,
      trim: true,
    },
    disputeAmount: {
      type: Number,
      required: [true, 'disputeAmount is required'],
      min: [0, 'disputeAmount must be non-negative'],
    },
    deadlineDate: {
      type: Date,
      alias: 'deadline',
      required: [true, 'deadlineDate is required'],
      index: true,
    },
    status: {
      type: String,
      required: true,
      enum: {
        values: CHARGEBACK_STATUSES,
        message: '{VALUE} is not a valid chargeback status',
      },
      default: 'OPEN',
      index: true,
    },
    generatedResponse: generatedResponseSchema,
    evidenceSummary: evidenceSummarySchema,
  },
  {
    timestamps: true,
  }
);

// Compound indexes
chargebackSchema.index({ merchantId: 1, status: 1 });
chargebackSchema.index({ merchantId: 1, deadlineDate: 1 });
chargebackSchema.index({ merchantId: 1, caseNumber: 1 }, { unique: true });

const Chargeback = mongoose.model('Chargeback', chargebackSchema);
Chargeback.CHARGEBACK_STATUSES = CHARGEBACK_STATUSES;
Chargeback.CHARGEBACK_NETWORKS = CHARGEBACK_NETWORKS;
Chargeback.ALLOWED_TRANSITIONS = ALLOWED_TRANSITIONS;

module.exports = Chargeback;

