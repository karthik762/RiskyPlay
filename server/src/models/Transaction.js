const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema(
  {
    street: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    postalCode: { type: String, trim: true },
    country: { type: String, trim: true, uppercase: true },
  },
  { _id: false }
);

const cartItemSchema = new mongoose.Schema(
  {
    productId: { type: String, trim: true },
    title: { type: String, required: true, trim: true },
    price: {
      type: Number,
      required: true,
      min: [0, 'Item price cannot be negative'],
    },
    quantity: {
      type: Number,
      required: true,
      min: [1, 'Quantity must be at least 1'],
      validate: {
        validator: Number.isInteger,
        message: 'Quantity must be a positive integer',
      },
    },
    category: { type: String, trim: true },
  },
  { _id: false }
);

const transactionSchema = new mongoose.Schema(
  {
    merchantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Merchant',
      required: [true, 'merchantId reference is required'],
      index: true,
    },
    externalTransactionId: {
      type: String,
      required: [true, 'externalTransactionId is required'],
      trim: true,
      index: true,
    },
    amount: {
      type: Number,
      required: [true, 'Transaction amount is required'],
      min: [0, 'Amount must be non-negative'],
    },
    currency: {
      type: String,
      required: [true, 'Currency is required'],
      uppercase: true,
      trim: true,
      minlength: 3,
      maxlength: 3,
      default: 'USD',
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    status: {
      type: String,
      required: true,
      enum: {
        values: ['APPROVED', 'DECLINED', 'MANUAL_REVIEW', 'REFUNDED'],
        message: '{VALUE} is not a valid transaction status',
      },
      default: 'MANUAL_REVIEW',
      index: true,
    },
    customer: {
      customerId: { type: String, trim: true },
      email: { type: String, lowercase: true, trim: true },
      phone: { type: String, trim: true },
      ipAddress: { type: String, trim: true },
      userAgent: { type: String, trim: true },
      billingAddress: addressSchema,
      shippingAddress: addressSchema,
    },
    paymentMethod: {
      cardBin: { type: String, trim: true, maxlength: 8 },
      cardLast4: { type: String, trim: true, maxlength: 4 },
      cardType: { type: String, trim: true },
      issuerCountry: { type: String, trim: true, uppercase: true },
    },
    cartItems: [cartItemSchema],
  },
  {
    timestamps: true,
  }
);

// Compound indexes
transactionSchema.index({ merchantId: 1, externalTransactionId: 1 }, { unique: true });
transactionSchema.index({ merchantId: 1, timestamp: -1 });
transactionSchema.index({ merchantId: 1, status: 1 });

module.exports = mongoose.model('Transaction', transactionSchema);
