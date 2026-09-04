const { z } = require('zod');
const { Transaction } = require('../models');

// Extract allowed statuses dynamically from Transaction Mongoose schema
const ALLOWED_STATUSES = Transaction.schema.path('status').enumValues;
const statusEnum = z.enum(ALLOWED_STATUSES);

// Common ObjectId validation schema (24-character hex string)
const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid ObjectId format');

// Address sub-schema
const addressSchema = z
  .object({
    street: z.string().trim().optional(),
    city: z.string().trim().optional(),
    state: z.string().trim().optional(),
    postalCode: z.string().trim().optional(),
    country: z.string().trim().toUpperCase().optional(),
  })
  .strict('Unrecognized fields in address object');

// Customer sub-schema
const customerSchema = z
  .object({
    customerId: z.string().trim().optional(),
    email: z
      .string()
      .email('Invalid customer email address')
      .toLowerCase()
      .trim()
      .optional(),
    phone: z.string().trim().optional(),
    ipAddress: z.string().trim().optional(),
    userAgent: z.string().trim().optional(),
    billingAddress: addressSchema.optional(),
    shippingAddress: addressSchema.optional(),
  })
  .strict('Unrecognized fields in customer object');

// Strict Payment Method sub-schema (prohibits PAN, CVV, PIN, credentials)
const paymentMethodSchema = z
  .object({
    cardBin: z
      .string()
      .max(8, 'cardBin cannot exceed 8 characters')
      .trim()
      .optional(),
    cardLast4: z
      .string()
      .max(4, 'cardLast4 cannot exceed 4 characters')
      .trim()
      .optional(),
    cardType: z.string().trim().optional(),
    issuerCountry: z.string().trim().toUpperCase().optional(),
  })
  .strict('Unrecognized or prohibited payment method fields');

// Cart item sub-schema
const cartItemSchema = z
  .object({
    productId: z.string().trim().optional(),
    title: z.string().min(1, 'Item title is required').trim(),
    price: z.number().min(0, 'Item price cannot be negative'),
    quantity: z
      .number()
      .int('Quantity must be an integer')
      .positive('Quantity must be positive'),
    category: z.string().trim().optional(),
  })
  .strict('Unrecognized fields in cart item');

// 1. Create Transaction Schema (POST /)
const createTransactionSchema = {
  body: z
    .object({
      merchantId: objectIdSchema,
      externalTransactionId: z
        .string({ required_error: 'externalTransactionId is required' })
        .min(1, 'externalTransactionId cannot be empty')
        .trim(),
      amount: z
        .number({ required_error: 'amount is required' })
        .min(0, 'Amount must be non-negative'),
      currency: z
        .string()
        .min(3, 'currency must be a 3-letter ISO code')
        .max(3, 'currency must be a 3-letter ISO code')
        .transform((val) => val.toUpperCase())
        .default('USD'),
      timestamp: z.coerce.date().optional(),
      status: statusEnum.optional(),
      customer: customerSchema.optional(),
      paymentMethod: paymentMethodSchema.optional(),
      cartItems: z.array(cartItemSchema).optional(),
    })
    .strict('Unrecognized or prohibited fields in request body'),
};

// 2. List Transactions Schema (GET /)
const listTransactionsSchema = {
  query: z
    .object({
      page: z.coerce
        .number()
        .int('page must be an integer')
        .min(1, 'page must be at least 1')
        .default(1),
      limit: z.coerce
        .number()
        .int('limit must be an integer')
        .min(1, 'limit must be at least 1')
        .max(100, 'limit cannot exceed 100')
        .default(20),
      status: statusEnum.optional(),
      merchantId: objectIdSchema.optional(),
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
    })
    .strict('Unrecognized query parameters'),
};

// 3. Transaction ID Param Schema (GET /:id)
const transactionIdParamSchema = {
  params: z
    .object({
      id: objectIdSchema,
    })
    .strict(),
};

// 4. Update Transaction Status Schema (PATCH /:id/status)
const updateTransactionStatusSchema = {
  params: z
    .object({
      id: objectIdSchema,
    })
    .strict(),
  body: z
    .object({
      status: statusEnum,
    })
    .strict('Only status may be updated via this endpoint'),
};

module.exports = {
  ALLOWED_STATUSES,
  createTransactionSchema,
  listTransactionsSchema,
  transactionIdParamSchema,
  updateTransactionStatusSchema,
};
