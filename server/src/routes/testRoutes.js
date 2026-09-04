const express = require('express');
const { z } = require('zod');
const validate = require('../middleware/validate');
const AppError = require('../utils/AppError');

const router = express.Router();

/**
 * Development & test-only schema to verify request validation.
 * NOT exposed as a permanent business API.
 */
const testValidationSchema = {
  body: z.object({
    merchantId: z.string().min(1, 'merchantId is required'),
    amount: z.number().positive('amount must be positive'),
  }),
};

// Test route: POST /api/v1/test/validate
router.post('/validate', validate(testValidationSchema), (req, res) => {
  res.status(200).json({
    success: true,
    data: req.body,
  });
});

// Test route: GET /api/v1/test/app-error
router.get('/app-error', (req, res, next) => {
  next(new AppError('Unauthorized access to resource', 401, 'UNAUTHORIZED'));
});

// Test route: GET /api/v1/test/generic-error
router.get('/generic-error', (req, res, next) => {
  next(new Error('Unexpected system failure'));
});

module.exports = router;
