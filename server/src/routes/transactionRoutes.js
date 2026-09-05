const express = require('express');
const authenticate = require('../middleware/authenticate');
const validate = require('../middleware/validate');
const transactionController = require('../controllers/transactionController');
const riskController = require('../controllers/riskController');
const {
  createTransactionSchema,
  listTransactionsSchema,
  transactionIdParamSchema,
  updateTransactionStatusSchema,
} = require('../validators/transactionValidators');

const router = express.Router();

// Enforce merchant authentication on all transaction routes
router.use(authenticate);

// POST /api/v1/transactions - Create transaction
router.post(
  '/',
  validate(createTransactionSchema),
  transactionController.createTransaction
);

// GET /api/v1/transactions - List and filter transactions
router.get(
  '/',
  validate(listTransactionsSchema),
  transactionController.getTransactions
);

// GET /api/v1/transactions/:id - Retrieve single transaction by ID
router.get(
  '/:id',
  validate(transactionIdParamSchema),
  transactionController.getTransactionById
);

// PATCH /api/v1/transactions/:id/status - Update transaction status
router.patch(
  '/:id/status',
  validate(updateTransactionStatusSchema),
  transactionController.updateTransactionStatus
);

// POST /api/v1/transactions/:id/risk - Run deterministic risk assessment
router.post(
  '/:id/risk',
  validate(transactionIdParamSchema),
  riskController.assessTransactionRisk
);

// GET /api/v1/transactions/:id/risk - Retrieve latest risk assessment
router.get(
  '/:id/risk',
  validate(transactionIdParamSchema),
  riskController.getLatestRiskAssessment
);

// GET /api/v1/transactions/:id/traces - Retrieve multi-agent execution traces
const traceController = require('../controllers/traceController');
router.get(
  '/:entityId/traces',
  validate(transactionIdParamSchema.rename ? transactionIdParamSchema : transactionIdParamSchema),
  traceController.getEntityTraces
);

// POST /api/v1/transactions/:id/risk/orchestrate - Run multi-agent risk orchestration
router.post(
  '/:id/risk/orchestrate',
  validate(transactionIdParamSchema),
  riskController.orchestrateTransactionRisk
);

module.exports = router;

