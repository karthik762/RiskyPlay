/**
 * Express router for Chargeback Response sub-resource.
 * Mounted at /api/v1/chargebacks/:chargebackId/response
 */

'use strict';

const express = require('express');
const authenticate = require('../middleware/authenticate');
const validate = require('../middleware/validate');
const chargebackResponseController = require('../controllers/chargebackResponseController');
const {
  chargebackParamSchema,
  verifyResponseSchema,
} = require('../validators/chargebackResponseValidators');

// mergeParams: true allows access to :chargebackId from parent router
const router = express.Router({ mergeParams: true });

// Enforce merchant authentication on all response routes
router.use(authenticate);

// POST /api/v1/chargebacks/:chargebackId/response/generate - Generate automated rebuttal draft
router.post(
  '/generate',
  validate(chargebackParamSchema),
  chargebackResponseController.generateResponse
);

// GET /api/v1/chargebacks/:chargebackId/response - Retrieve latest response draft
router.get(
  '/',
  validate(chargebackParamSchema),
  chargebackResponseController.getResponse
);

// POST /api/v1/chargebacks/:chargebackId/response/verify - Run deterministic verification
router.post(
  '/verify',
  validate(verifyResponseSchema),
  chargebackResponseController.verifyResponse
);

module.exports = router;
