const mongoose = require('mongoose');

const agentTraceSchema = new mongoose.Schema(
  {
    runId: {
      type: String,
      required: [true, 'runId is required'],
      trim: true,
      index: true,
    },
    entityType: {
      type: String,
      required: [true, 'entityType is required'],
      enum: {
        values: ['TRANSACTION_RISK', 'CHARGEBACK_REBUTTAL'],
        message: '{VALUE} is not a valid entityType',
      },
      index: true,
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, 'entityId reference is required'],
      index: true,
    },
    agentName: {
      type: String,
      required: [true, 'agentName is required'],
      enum: {
        values: [
          'ORCHESTRATOR',
          'RISK_ANALYST',
          'TRANSACTION_RISK_BASELINE',
          'RISK_VERIFICATION',
          'EVIDENCE',
          'CHARGEBACK_RESPONSE',
          'VERIFICATION_QA',
          'DECISION',
        ],
        message: '{VALUE} is not a recognized agent name',
      },
      index: true,
    },
    stepIndex: {
      type: Number,
      required: [true, 'stepIndex is required'],
      min: [0, 'stepIndex must be non-negative'],
      validate: {
        validator: Number.isInteger,
        message: 'stepIndex must be an integer',
      },
    },
    status: {
      type: String,
      enum: {
        values: ['COMPLETED', 'FAILED', 'TIMEOUT'],
        message: '{VALUE} is not a valid agent trace status',
      },
      default: 'COMPLETED',
      index: true,
    },
    errorCode: {
      type: String,
      trim: true,
    },
    errorMessage: {
      type: String,
      trim: true,
    },
    inputData: {
      type: mongoose.Schema.Types.Mixed,
    },
    reasoning: {
      type: String,
      trim: true,
    },
    outputData: {
      type: mongoose.Schema.Types.Mixed,
    },
    modelUsed: {
      type: String,
      trim: true,
    },
    tokensUsed: {
      type: Number,
      min: [0, 'tokensUsed must be non-negative'],
      default: 0,
    },
    latencyMs: {
      type: Number,
      min: [0, 'latencyMs must be non-negative'],
      default: 0,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
agentTraceSchema.index({ runId: 1, stepIndex: 1 });
agentTraceSchema.index({ entityId: 1, timestamp: -1 });

module.exports = mongoose.model('AgentTrace', agentTraceSchema);
