const mongoose = require('mongoose');

const merchantSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Merchant name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Merchant email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
      select: false, // Omitted from default queries for security
    },
    currency: {
      type: String,
      required: [true, 'Currency is required'],
      default: 'USD',
      uppercase: true,
      trim: true,
      minlength: 3,
      maxlength: 3,
    },
    riskThresholds: {
      autoApproveScore: {
        type: Number,
        required: true,
        default: 30,
        min: [0, 'Threshold cannot be less than 0'],
        max: [100, 'Threshold cannot exceed 100'],
      },
      manualReviewScore: {
        type: Number,
        required: true,
        default: 65,
        min: [0, 'Threshold cannot be less than 0'],
        max: [100, 'Threshold cannot exceed 100'],
      },
      autoDeclineScore: {
        type: Number,
        required: true,
        default: 85,
        min: [0, 'Threshold cannot be less than 0'],
        max: [100, 'Threshold cannot exceed 100'],
      },
    },
    businessProfile: {
      industry: {
        type: String,
        trim: true,
        default: 'e-commerce',
      },
      returnPolicyDays: {
        type: Number,
        min: [0, 'Return policy days must be non-negative'],
        default: 30,
      },
      refundPolicy: {
        type: String,
        trim: true,
      },
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Merchant', merchantSchema);
