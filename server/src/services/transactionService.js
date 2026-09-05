const mongoose = require('mongoose');
const { Transaction } = require('../models');
const AppError = require('../utils/AppError');

/**
 * Creates and persists a new transaction.
 * Merchant ownership is strictly derived from the authenticated merchantId parameter.
 * Any client-supplied merchantId is stripped/overridden.
 *
 * @param {string} merchantId - Authenticated merchant ObjectId
 * @param {Object} data - Validated transaction data
 * @returns {Promise<Object>} Created transaction document
 */
async function createTransaction(merchantId, data) {
  try {
    const { merchantId: _ignored, ...transactionData } = data;
    transactionData.merchantId = merchantId;

    const transaction = await Transaction.create(transactionData);
    return transaction;
  } catch (error) {
    if (error.code === 11000) {
      throw new AppError(
        'Transaction with this externalTransactionId already exists for this merchant',
        409,
        'DUPLICATE_TRANSACTION'
      );
    }
    throw error;
  }
}

/**
 * Retrieves a paginated and filtered list of transactions strictly for the authenticated merchant.
 *
 * @param {string} merchantId - Authenticated merchant ObjectId
 * @param {Object} filters - Query filters (status, from, to)
 * @param {Object} pagination - Pagination options (page, limit)
 * @returns {Promise<Object>} Paginated transaction list
 */
async function getTransactions(merchantId, filters = {}, pagination = {}) {
  const page = Math.max(1, parseInt(pagination.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(pagination.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const query = {
    merchantId,
  };

  if (filters.status) {
    query.status = filters.status;
  }

  if (filters.from || filters.to) {
    query.timestamp = {};
    if (filters.from) {
      query.timestamp.$gte = new Date(filters.from);
    }
    if (filters.to) {
      query.timestamp.$lte = new Date(filters.to);
    }
  }

  const [data, total] = await Promise.all([
    Transaction.find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Transaction.countDocuments(query),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
    },
  };
}

/**
 * Retrieves a single transaction by its MongoDB ObjectId, strictly for the authenticated merchant.
 *
 * @param {string} merchantId - Authenticated merchant ObjectId
 * @param {string} id - Transaction ObjectId
 * @returns {Promise<Object>} Transaction document
 */
async function getTransactionById(merchantId, id) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError('Invalid transaction ID', 400, 'VALIDATION_ERROR');
  }

  const transaction = await Transaction.findOne({
    _id: id,
    merchantId,
  });

  if (!transaction) {
    throw new AppError('Transaction not found', 404, 'TRANSACTION_NOT_FOUND');
  }

  return transaction;
}

/**
 * Updates the risk/settlement status of a transaction, strictly for the authenticated merchant.
 *
 * @param {string} merchantId - Authenticated merchant ObjectId
 * @param {string} id - Transaction ObjectId
 * @param {string} status - New transaction status
 * @returns {Promise<Object>} Updated transaction document
 */
async function updateTransactionStatus(merchantId, id, status) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError('Invalid transaction ID', 400, 'VALIDATION_ERROR');
  }

  const allowedStatuses = Transaction.schema.path('status').enumValues;
  if (!allowedStatuses.includes(status)) {
    throw new AppError(
      `Invalid status. Allowed values are: ${allowedStatuses.join(', ')}`,
      400,
      'VALIDATION_ERROR'
    );
  }

  const transaction = await Transaction.findOneAndUpdate(
    { _id: id, merchantId },
    { status },
    { returnDocument: 'after', runValidators: true }
  );

  if (!transaction) {
    throw new AppError('Transaction not found', 404, 'TRANSACTION_NOT_FOUND');
  }

  return transaction;
}

module.exports = {
  createTransaction,
  getTransactions,
  getTransactionById,
  updateTransactionStatus,
};
