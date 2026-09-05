/**
 * Zod validation schemas for Chargeback Defensive Response endpoints.
 */

'use strict';

const { z } = require('zod');

const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid ObjectId format');

const chargebackParamSchema = {
  params: z.object({
    chargebackId: objectIdSchema,
  }),
};

const verifyResponseSchema = {
  params: z.object({
    chargebackId: objectIdSchema,
  }),
  body: z
    .object({
      responseText: z.string().trim().min(10).optional(),
      responseSummary: z.string().trim().min(1).optional(),
      keyArguments: z
        .array(
          z.object({
            claim: z.string().min(1),
            evidenceIds: z.array(z.string()).optional(),
            evidenceItemIds: z.array(z.string()).optional(),
          })
        )
        .optional(),
    })
    .optional(),
};

module.exports = {
  objectIdSchema,
  chargebackParamSchema,
  verifyResponseSchema,
};
