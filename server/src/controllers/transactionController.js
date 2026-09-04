const transactionService = require('../services/transactionService');

/**
 * Controller to handle transaction creation.
 * Responds with HTTP 201 on success.
 */
async function createTransaction(req, res, next) {
  try {
    const transaction = await transactionService.createTransaction(req.body);
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
 * Responds with HTTP 200 on success.
 */
async function getTransactions(req, res, next) {
  try {
    const { page, limit, status, merchantId, from, to } = req.query;
    const result = await transactionService.getTransactions(
      { status, merchantId, from, to },
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
 * Responds with HTTP 200 on success.
 */
async function getTransactionById(req, res, next) {
  try {
    const transaction = await transactionService.getTransactionById(req.params.id);
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
 * Responds with HTTP 200 on success.
 */
async function updateTransactionStatus(req, res, next) {
  try {
    const transaction = await transactionService.updateTransactionStatus(
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
