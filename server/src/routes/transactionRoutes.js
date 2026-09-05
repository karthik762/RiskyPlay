const express = require('express');
const authenticate = require('../middleware/authenticate');
const validate = require('../middleware/validate');
const transactionController = require('../controllers/transactionController');
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

module.exports = router;
