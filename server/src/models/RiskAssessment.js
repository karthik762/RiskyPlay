const mongoose = require('mongoose');

const signalSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    severity: {
      type: String,
      required: true,
      enum: {
        values: ['LOW', 'MEDIUM', 'HIGH'],
        message: '{VALUE} is not a valid signal severity',
      },
    },
    confidence: {
      type: Number,
      required: true,
      min: [0, 'Confidence must be at least 0'],
      max: [1, 'Confidence cannot exceed 1'],
    },
  },
  { _id: false }
);

const ruleMatchSchema = new mongoose.Schema(
  {
    ruleId: { type: String, required: true, trim: true },
    ruleName: { type: String, required: true, trim: true },
    action: { type: String, trim: true },
    triggered: { type: Boolean, default: false },
    details: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false }
);

const riskAssessmentSchema = new mongoose.Schema(
  {
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
      required: [true, 'transactionId reference is required'],
      index: true,
    },
    riskScore: {
      type: Number,
      required: [true, 'riskScore is required'],
      min: [0, 'riskScore must be at least 0'],
      max: [100, 'riskScore cannot exceed 100'],
      validate: {
        validator: Number.isInteger,
        message: 'riskScore must be an integer between 0 and 100',
      },
      index: true,
    },
    riskTier: {
      type: String,
      required: true,
      enum: {
        values: ['LOW', 'MEDIUM', 'HIGH'],
        message: '{VALUE} is not a valid risk tier',
      },
      index: true,
    },
    signals: [signalSchema],
    baselineScore: {
      type: Number,
      min: [0, 'baselineScore cannot be negative'],
      max: [100, 'baselineScore cannot exceed 100'],
    },
    aiScore: {
      type: Number,
      min: [0, 'aiScore cannot be negative'],
      max: [100, 'aiScore cannot exceed 100'],
    },
    recommendation: {
      type: String,
      required: true,
      enum: {
        values: ['APPROVE', 'REVIEW', 'DECLINE'],
        message: '{VALUE} is not a valid recommendation',
      },
    },
    ruleMatches: [ruleMatchSchema],
  },
  {
    timestamps: true,
  }
);

// Indexes
riskAssessmentSchema.index({ transactionId: 1, createdAt: -1 });
riskAssessmentSchema.index({ riskScore: 1 });
riskAssessmentSchema.index({ riskTier: 1 });
riskAssessmentSchema.index({ createdAt: -1 });

module.exports = mongoose.model('RiskAssessment', riskAssessmentSchema);
