const { z } = require('zod');
const { Chargeback } = require('../models');

const ALLOWED_STATUSES = Chargeback.CHARGEBACK_STATUSES;
const ALLOWED_NETWORKS = Chargeback.CHARGEBACK_NETWORKS;

const statusEnum = z.enum(ALLOWED_STATUSES);
const networkEnum = z.enum(ALLOWED_NETWORKS);

// Common 24-character hexadecimal ObjectId schema
const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid ObjectId format');

// 1. Create Chargeback Schema (POST /api/v1/chargebacks)
const createChargebackSchema = {
  body: z
    .object({
      merchantId: objectIdSchema.optional(), // Ignored/overridden by service with req.user.merchantId
      caseNumber: z
        .string({ required_error: 'caseNumber is required' })
        .min(1, 'caseNumber cannot be empty')
        .max(100, 'caseNumber cannot exceed 100 characters')
        .trim(),
      transactionId: objectIdSchema,
      network: networkEnum,
      reasonCode: z
        .string({ required_error: 'reasonCode is required' })
        .min(1, 'reasonCode cannot be empty')
        .max(50, 'reasonCode cannot exceed 50 characters')
        .trim(),
      reasonDescription: z
        .string()
        .max(500, 'reasonDescription cannot exceed 500 characters')
        .trim()
        .optional(),
      disputeAmount: z
        .number({ required_error: 'disputeAmount is required' })
        .positive('disputeAmount must be positive'),
      deadline: z.coerce.date({
        required_error: 'deadline is required',
        invalid_type_error: 'Invalid deadline date format',
      }),
    })
    .strict('Unrecognized or prohibited fields in request body'),
};

// 2. List Chargebacks Schema (GET /api/v1/chargebacks)
const listChargebacksSchema = {
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
      network: networkEnum.optional(),
      reasonCode: z.string().trim().optional(),
      transactionId: objectIdSchema.optional(),
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
      deadlineFrom: z.coerce.date().optional(),
      deadlineTo: z.coerce.date().optional(),
      sortBy: z.enum(['createdAt', 'deadlineDate', 'disputeAmount']).default('createdAt'),
      sortOrder: z.enum(['asc', 'desc']).default('desc'),
    })
    .strict('Unrecognized query parameters'),
};

// 3. Chargeback ID Param Schema (GET /api/v1/chargebacks/:id)
const chargebackIdParamSchema = {
  params: z
    .object({
      id: objectIdSchema,
    })
    .strict(),
};

// 4. Update Chargeback Status Schema (PATCH /api/v1/chargebacks/:id/status)
const updateChargebackStatusSchema = {
  params: z
    .object({
      id: objectIdSchema,
    })
    .strict(),
  body: z
    .object({
      merchantId: objectIdSchema.optional(), // Ignored/overridden
      status: statusEnum,
      reason: z
        .string()
        .max(500, 'reason cannot exceed 500 characters')
        .trim()
        .optional(),
    })
    .strict('Only status and reason may be provided in request body'),
};

module.exports = {
  ALLOWED_STATUSES,
  ALLOWED_NETWORKS,
  createChargebackSchema,
  listChargebacksSchema,
  chargebackIdParamSchema,
  updateChargebackStatusSchema,
};
