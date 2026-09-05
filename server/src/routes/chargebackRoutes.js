const express = require('express');
const authenticate = require('../middleware/authenticate');
const validate = require('../middleware/validate');
const chargebackController = require('../controllers/chargebackController');
const {
  createChargebackSchema,
  listChargebacksSchema,
  chargebackIdParamSchema,
  updateChargebackStatusSchema,
} = require('../validators/chargebackValidators');

const router = express.Router();

// Enforce merchant authentication on all chargeback routes
router.use(authenticate);

// POST /api/v1/chargebacks - Create chargeback case
router.post(
  '/',
  validate(createChargebackSchema),
  chargebackController.createChargeback
);

// GET /api/v1/chargebacks - List and filter chargebacks
router.get(
  '/',
  validate(listChargebacksSchema),
  chargebackController.getChargebacks
);

// GET /api/v1/chargebacks/:id - Retrieve single chargeback by ID
router.get(
  '/:id',
  validate(chargebackIdParamSchema),
  chargebackController.getChargebackById
);

// PATCH /api/v1/chargebacks/:id/status - Update chargeback lifecycle status
router.patch(
  '/:id/status',
  validate(updateChargebackStatusSchema),
  chargebackController.updateChargebackStatus
);

// Mount evidence sub-resource router under /:chargebackId/evidence
const evidenceRoutes = require('./evidenceRoutes');
router.use('/:chargebackId/evidence', evidenceRoutes);

module.exports = router;
