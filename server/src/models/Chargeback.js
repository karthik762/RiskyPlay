const mongoose = require('mongoose');

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
      index: true,
    },
    network: {
      type: String,
      required: true,
      enum: {
        values: ['VISA', 'MASTERCARD', 'AMEX', 'OTHER'],
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
      required: [true, 'deadlineDate is required'],
      index: true,
    },
    status: {
      type: String,
      required: true,
      enum: {
        values: [
          'RECEIVED',
          'EVIDENCE_GATHERING',
          'RESPONSE_GENERATED',
          'SUBMITTED',
          'WON',
          'LOST',
        ],
        message: '{VALUE} is not a valid chargeback status',
      },
      default: 'RECEIVED',
      index: true,
    },
    generatedResponse: generatedResponseSchema,
  },
  {
    timestamps: true,
  }
);

// Indexes
chargebackSchema.index({ merchantId: 1, status: 1 });
chargebackSchema.index({ merchantId: 1, deadlineDate: 1 });
chargebackSchema.index({ caseNumber: 1, merchantId: 1 });

module.exports = mongoose.model('Chargeback', chargebackSchema);
