const mongoose = require('mongoose');

const evidenceMetadataSchema = new mongoose.Schema(
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
    value: { type: String, required: true, trim: true },
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
    },
    type: {
      type: String,
      required: [true, 'Evidence type is required'],
      enum: {
        values: [
          'CARRIER_PROOF',
          'RECEIPT',
          'CUSTOMER_COMMUNICATION',
          'TERMS_ACCEPTANCE',
          'IP_GEOLOCATION',
          'OTHER',
        ],
        message: '{VALUE} is not a valid evidence type',
      },
      index: true,
    },
    fileName: {
      type: String,
      required: [true, 'fileName is required'],
      trim: true,
    },
    fileUrl: {
      type: String,
      trim: true,
    },
    metadata: evidenceMetadataSchema,
    extractedFacts: [extractedFactSchema],
  },
  {
    timestamps: true,
  }
);

// Indexes
evidenceSchema.index({ chargebackId: 1, type: 1 });
evidenceSchema.index({ transactionId: 1 });

module.exports = mongoose.model('Evidence', evidenceSchema);
