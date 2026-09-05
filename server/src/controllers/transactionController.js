const transactionService = require('../services/transactionService');

/**
 * Controller to handle transaction creation.
 * Sets merchant ownership strictly from req.user.merchantId.
 * Responds with HTTP 201 on success.
 */
async function createTransaction(req, res, next) {
  try {
    const transaction = await transactionService.createTransaction(
      req.user.merchantId,
      req.body
    );
    res.status(201).json({
      success: true,
      data: transaction,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Controller to handle listing and filtering transactions with pagination.
 * Strictly scoped to the authenticated merchant.
 * Responds with HTTP 200 on success.
 */
async function getTransactions(req, res, next) {
  try {
    const { page, limit, status, from, to } = req.query;
    const result = await transactionService.getTransactions(
      req.user.merchantId,
      { status, from, to },
      { page, limit }
    );
    res.status(200).json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Controller to retrieve a single transaction by ID.
 * Strictly scoped to the authenticated merchant.
 * Responds with HTTP 200 on success.
 */
async function getTransactionById(req, res, next) {
  try {
    const transaction = await transactionService.getTransactionById(
      req.user.merchantId,
      req.params.id
    );
    res.status(200).json({
      success: true,
      data: transaction,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Controller to update a transaction's status.
 * Strictly scoped to the authenticated merchant.
 * Responds with HTTP 200 on success.
 */
async function updateTransactionStatus(req, res, next) {
  try {
    const transaction = await transactionService.updateTransactionStatus(
      req.user.merchantId,
      req.params.id,
      req.body.status
    );
    res.status(200).json({
      success: true,
      data: transaction,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createTransaction,
  getTransactions,
  getTransactionById,
  updateTransactionStatus,
};
