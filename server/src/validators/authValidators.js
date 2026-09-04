const { z } = require('zod');

const businessProfileSchema = z
  .object({
    industry: z.string().trim().max(100).optional(),
    returnPolicyDays: z
      .number()
      .int('returnPolicyDays must be an integer')
      .min(0, 'returnPolicyDays must be non-negative')
      .optional(),
    refundPolicy: z.string().trim().max(1000).optional(),
  })
  .strict('Unrecognized fields in businessProfile');

// Signup validation schema
const signupSchema = {
  body: z
    .object({
      name: z
        .string({ required_error: 'name is required' })
        .trim()
        .min(1, 'name cannot be empty')
        .max(100, 'name cannot exceed 100 characters'),
      email: z
        .string({ required_error: 'email is required' })
        .trim()
        .toLowerCase()
        .email('Invalid email address'),
      password: z
        .string({ required_error: 'password is required' })
        .min(8, 'Password must be at least 8 characters')
        .max(128, 'Password cannot exceed 128 characters'),
      currency: z
        .string()
        .min(3, 'currency must be a 3-letter ISO code')
        .max(3, 'currency must be a 3-letter ISO code')
        .transform((val) => val.toUpperCase())
        .default('USD'),
      businessProfile: businessProfileSchema.optional(),
    })
    .strict('Unrecognized or prohibited fields in signup request'),
};

// Login validation schema
const loginSchema = {
  body: z
    .object({
      email: z
        .string({ required_error: 'email is required' })
        .trim()
        .toLowerCase()
        .email('Invalid email address'),
      password: z
        .string({ required_error: 'password is required' })
        .min(1, 'password cannot be empty'),
    })
    .strict('Unrecognized fields in login request'),
};

module.exports = {
  signupSchema,
  loginSchema,
};
