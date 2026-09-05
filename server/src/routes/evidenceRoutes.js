const express = require('express');
const authenticate = require('../middleware/authenticate');
const validate = require('../middleware/validate');
const evidenceController = require('../controllers/evidenceController');
const {
  chargebackParamSchema,
  createEvidenceSchema,
  listEvidenceSchema,
  evidenceIdParamsSchema,
  updateEvidenceSchema,
} = require('../validators/evidenceValidators');

// mergeParams: true allows accessing :chargebackId from the parent router
const router = express.Router({ mergeParams: true });

// Enforce merchant authentication on all evidence routes
router.use(authenticate);

// POST /api/v1/chargebacks/:chargebackId/evidence - Create evidence
router.post(
  '/',
  validate(createEvidenceSchema),
  evidenceController.createEvidence
);

// GET /api/v1/chargebacks/:chargebackId/evidence - List evidence
router.get(
  '/',
  validate(listEvidenceSchema),
  evidenceController.listEvidence
);

// GET /api/v1/chargebacks/:chargebackId/evidence/index - Build and retrieve deterministic evidence index
// Defined before /:evidenceId to avoid routing collision
router.get(
  '/index',
  validate(chargebackParamSchema),
  evidenceController.getEvidenceIndex
);

// GET /api/v1/chargebacks/:chargebackId/evidence/:evidenceId - Retrieve single evidence by ID
router.get(
  '/:evidenceId',
  validate(evidenceIdParamsSchema),
  evidenceController.getEvidenceById
);

// PATCH /api/v1/chargebacks/:chargebackId/evidence/:evidenceId - Update evidence metadata
router.patch(
  '/:evidenceId',
  validate(updateEvidenceSchema),
  evidenceController.updateEvidence
);

// DELETE /api/v1/chargebacks/:chargebackId/evidence/:evidenceId - Delete evidence
router.delete(
  '/:evidenceId',
  validate(evidenceIdParamsSchema),
  evidenceController.deleteEvidence
);

module.exports = router;
