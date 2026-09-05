const { z } = require('zod');
const { Evidence } = require('../models');

const ALLOWED_TYPES = Evidence.EVIDENCE_TYPES;
const ALLOWED_SOURCES = Evidence.EVIDENCE_SOURCES;

const evidenceTypeEnum = z.enum(ALLOWED_TYPES);
const evidenceSourceEnum = z.enum(ALLOWED_SOURCES);

// Common 24-character hexadecimal ObjectId schema
const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid ObjectId format');

// Prohibited security / credential terms filter
const PROHIBITED_KEYWORDS = [
  'pan',
  'cvv',
  'cvc',
  'pin',
  'password',
  'passwordhash',
  'jwt',
  'token',
  'apikey',
  'secret',
  'cardnumber',
];

function isSafeString(val) {
  if (typeof val !== 'string') return true;
  const lower = val.toLowerCase();
  for (const keyword of PROHIBITED_KEYWORDS) {
    // Check for exact word or dangerous key match
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(lower) || lower.includes(`"${keyword}"`)) {
      return false;
    }
  }
  return true;
}

function hasPathTraversal(val) {
  if (typeof val !== 'string') return false;
  return val.includes('..') || val.includes('../') || val.includes('..\\');
}

// Bounded and sanitized file metadata schema
const fileMetadataSchema = z
  .object({
    filename: z
      .string()
      .max(255, 'filename cannot exceed 255 characters')
      .refine((val) => !hasPathTraversal(val), {
        message: 'Path traversal is strictly prohibited in filename',
      })
      .trim()
      .optional(),
    mimeType: z
      .string()
      .max(100, 'mimeType cannot exceed 100 characters')
      .trim()
      .optional(),
    sizeBytes: z
      .number()
      .int('sizeBytes must be an integer')
      .min(0, 'sizeBytes must be non-negative')
      .max(52428800, 'File size cannot exceed 50MB (52,428,800 bytes)')
      .optional(),
    storageKey: z
      .string()
      .max(500, 'storageKey cannot exceed 500 characters')
      .refine((val) => !hasPathTraversal(val), {
        message: 'Path traversal is strictly prohibited in storageKey',
      })
      .trim()
      .optional(),
  })
  .strict('Unrecognized fields in fileMetadata');

// Strictly validated observable extracted fact schema
const extractedFactSchema = z
  .object({
    key: z
      .string({ required_error: 'Fact key is required' })
      .min(1, 'Fact key cannot be empty')
      .max(100, 'Fact key cannot exceed 100 characters')
      .refine((val) => isSafeString(val), {
        message: 'Prohibited credential or cardholder keyword in fact key',
      })
      .trim(),
    value: z
      .union([z.string(), z.number(), z.boolean()])
      .refine(
        (val) => {
          if (typeof val === 'string') {
            return isSafeString(val) && val.length <= 1000;
          }
          return true;
        },
        {
          message: 'Fact value contains prohibited credential terms or exceeds length limits',
        }
      ),
    confidence: z
      .number()
      .min(0, 'confidence cannot be negative')
      .max(1, 'confidence cannot exceed 1.0')
      .default(1.0)
      .optional(),
    verified: z.boolean().default(false).optional(),
  })
  .strict('Unrecognized fields in extractedFact');

// 1. Create Evidence Schema (POST /api/v1/chargebacks/:chargebackId/evidence)
const createEvidenceSchema = {
  params: z
    .object({
      chargebackId: objectIdSchema,
    })
    .strict(),
  body: z
    .object({
      merchantId: objectIdSchema.optional(), // Ignored/overridden from req.user
      transactionId: objectIdSchema.optional(),
      type: evidenceTypeEnum,
      title: z
        .string({ required_error: 'title is required' })
        .min(1, 'title cannot be empty')
        .max(200, 'title cannot exceed 200 characters')
        .trim(),
      description: z
        .string()
        .max(2000, 'description cannot exceed 2000 characters')
        .trim()
        .optional(),
      source: evidenceSourceEnum.default('MANUAL').optional(),
      fileMetadata: fileMetadataSchema.optional(),
      extractedFacts: z.array(extractedFactSchema).max(50, 'Max 50 extracted facts').optional(),
      collectedAt: z.coerce.date().optional(),
    })
    .strict('Unrecognized or prohibited fields in request body'),
};

// 2. List Evidence Schema (GET /api/v1/chargebacks/:chargebackId/evidence)
const listEvidenceSchema = {
  params: z
    .object({
      chargebackId: objectIdSchema,
    })
    .strict(),
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
      type: evidenceTypeEnum.optional(),
      source: evidenceSourceEnum.optional(),
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
      sortBy: z.enum(['createdAt', 'collectedAt', 'type']).default('createdAt'),
      sortOrder: z.enum(['asc', 'desc']).default('desc'),
    })
    .strict('Unrecognized query parameters'),
};

// 3. Evidence ID Params Schema (GET/DELETE /api/v1/chargebacks/:chargebackId/evidence/:evidenceId)
const evidenceIdParamsSchema = {
  params: z
    .object({
      chargebackId: objectIdSchema,
      evidenceId: objectIdSchema,
    })
    .strict(),
};

// 4. Update Evidence Schema (PATCH /api/v1/chargebacks/:chargebackId/evidence/:evidenceId)
const updateEvidenceSchema = {
  params: z
    .object({
      chargebackId: objectIdSchema,
      evidenceId: objectIdSchema,
    })
    .strict(),
  body: z
    .object({
      title: z
        .string()
        .min(1, 'title cannot be empty')
        .max(200, 'title cannot exceed 200 characters')
        .trim()
        .optional(),
      description: z
        .string()
        .max(2000, 'description cannot exceed 2000 characters')
        .trim()
        .optional(),
      type: evidenceTypeEnum.optional(),
      source: evidenceSourceEnum.optional(),
      fileMetadata: fileMetadataSchema.optional(),
      extractedFacts: z.array(extractedFactSchema).max(50, 'Max 50 extracted facts').optional(),
    })
    .strict('Unrecognized or prohibited fields in update body'),
};

// Chargeback Param Schema for /index endpoint
const chargebackParamSchema = {
  params: z
    .object({
      chargebackId: objectIdSchema,
    })
    .strict(),
};

module.exports = {
  ALLOWED_TYPES,
  ALLOWED_SOURCES,
  chargebackParamSchema,
  createEvidenceSchema,
  listEvidenceSchema,
  evidenceIdParamsSchema,
  updateEvidenceSchema,
};
