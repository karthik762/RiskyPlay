const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    entityType: {
      type: String,
      required: [true, 'entityType is required'],
      trim: true,
      index: true,
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, 'entityId is required'],
      index: true,
    },
    actorId: {
      type: String,
      required: [true, 'actorId is required'],
      trim: true,
    },
    actorType: {
      type: String,
      required: true,
      enum: {
        values: ['MERCHANT', 'SYSTEM'],
        message: '{VALUE} is not a valid actorType',
      },
      index: true,
    },
    action: {
      type: String,
      required: [true, 'action is required'],
      trim: true,
    },
    previousState: {
      type: mongoose.Schema.Types.Mixed,
    },
    newState: {
      type: mongoose.Schema.Types.Mixed,
    },
    reason: {
      type: String,
      trim: true,
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
auditLogSchema.index({ entityType: 1, entityId: 1, timestamp: -1 });
auditLogSchema.index({ actorType: 1, timestamp: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
