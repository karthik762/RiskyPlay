const mongoose = require('mongoose');
const { Chargeback, Transaction, AuditLog } = require('../models');
const AppError = require('../utils/AppError');

const ALLOWED_TRANSITIONS = Chargeback.ALLOWED_TRANSITIONS;

/**
 * Computes the real-time deadline status relative to the current timestamp.
 *
 * @param {Date|string|number} deadlineDate
 * @param {string} status - Current chargeback status
 * @param {Date} [now=new Date()] - Reference timestamp (default: Date.now)
 * @returns {'COMPLETED'|'OVERDUE'|'DUE_SOON'|'UPCOMING'}
 */
function computeDeadlineStatus(deadlineDate, status, now = new Date()) {
  // If the chargeback has reached a resolved / terminal status, the deadline is satisfied/moot
  if (['WON', 'LOST', 'CLOSED'].includes(status)) {
    return 'COMPLETED';
  }

  const deadline = new Date(deadlineDate);
  const currentTime = new Date(now);

  if (deadline.getTime() < currentTime.getTime()) {
    return 'OVERDUE';
  }

  const diffMs = deadline.getTime() - currentTime.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  // If deadline is within 3 days (72 hours), mark as DUE_SOON
  if (diffDays <= 3) {
    return 'DUE_SOON';
  }

  return 'UPCOMING';
}

/**
 * Validates whether a status transition is permitted by the state machine.
 *
 * @param {string} currentStatus
 * @param {string} targetStatus
 * @throws {AppError} 400 INVALID_CHARGEBACK_TRANSITION if illegal
 */
function validateStatusTransition(currentStatus, targetStatus) {
  if (currentStatus === targetStatus) {
    throw new AppError(
      `Chargeback is already in status '${currentStatus}'`,
      400,
      'INVALID_CHARGEBACK_TRANSITION'
    );
  }

  const permitted = ALLOWED_TRANSITIONS[currentStatus] || [];
  if (!permitted.includes(targetStatus)) {
    throw new AppError(
      `Cannot transition chargeback from '${currentStatus}' to '${targetStatus}'`,
      400,
      'INVALID_CHARGEBACK_TRANSITION'
    );
  }
}

/**
 * Formats a Chargeback document into a sanitized, tenant-safe client response.
 * Strips MongoDB internals and guarantees sensitive payment details are never leaked.
 *
 * @param {Object} chargeback - Mongoose Chargeback document or plain object
 * @param {Object} [options]
 * @param {Date} [options.now] - Optional reference time for deadline calculation
 * @returns {Object} Sanitized chargeback payload
 */
function formatChargeback(chargeback, options = {}) {
  const doc = chargeback.toObject ? chargeback.toObject({ virtuals: true }) : chargeback;
  const deadlineDate = doc.deadlineDate || doc.deadline;

  const formatted = {
    id: (doc._id || doc.id).toString(),
    merchantId: doc.merchantId.toString(),
    transactionId: doc.transactionId
      ? (doc.transactionId._id ? doc.transactionId._id.toString() : doc.transactionId.toString())
      : null,
    caseNumber: doc.caseNumber,
    network: doc.network,
    reasonCode: doc.reasonCode,
    reasonDescription: doc.reasonDescription || null,
    disputeAmount: doc.disputeAmount,
    deadline: deadlineDate,
    deadlineStatus: computeDeadlineStatus(deadlineDate, doc.status, options.now),
    status: doc.status,
    generatedResponse: doc.generatedResponse || null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };

  // If transaction was populated, attach sanitized, non-sensitive summary
  if (doc.transactionId && typeof doc.transactionId === 'object' && doc.transactionId.externalTransactionId) {
    formatted.transaction = {
      id: doc.transactionId._id.toString(),
      externalTransactionId: doc.transactionId.externalTransactionId,
      amount: doc.transactionId.amount,
      currency: doc.transactionId.currency,
      status: doc.transactionId.status,
      timestamp: doc.transactionId.timestamp,
    };
  }

  return formatted;
}

/**
 * Creates a new chargeback case linked to an existing merchant transaction.
 *
 * @param {string} merchantId - Authenticated merchant ObjectId
 * @param {Object} data - Validated chargeback input data
 * @returns {Promise<Object>} Formatted chargeback document
 */
async function createChargeback(merchantId, data) {
  const { merchantId: _ignored, ...chargebackData } = data;
  const deadlineDate = chargebackData.deadline || chargebackData.deadlineDate;

  if (!mongoose.Types.ObjectId.isValid(chargebackData.transactionId)) {
    throw new AppError('Invalid transaction ID', 400, 'VALIDATION_ERROR');
  }

  // 1. Resolve transaction strictly scoped to authenticated merchant
  const transaction = await Transaction.findOne({
    _id: chargebackData.transactionId,
    merchantId,
  });

  if (!transaction) {
    throw new AppError('Transaction not found', 404, 'TRANSACTION_NOT_FOUND');
  }

  // 2. Validate dispute amount against transaction amount
  if (Math.abs(chargebackData.disputeAmount - transaction.amount) > 0.001) {
    throw new AppError(
      `disputeAmount (${chargebackData.disputeAmount}) must match transaction amount (${transaction.amount})`,
      400,
      'VALIDATION_ERROR'
    );
  }

  // 3. Prevent duplicate caseNumber for this merchant
  const existingCase = await Chargeback.findOne({
    merchantId,
    caseNumber: chargebackData.caseNumber,
  });

  if (existingCase) {
    throw new AppError(
      'Chargeback with this caseNumber already exists for this merchant',
      409,
      'DUPLICATE_CHARGEBACK'
    );
  }

  // 4. Persist Chargeback document
  try {
    const chargeback = await Chargeback.create({
      merchantId,
      transactionId: transaction._id,
      caseNumber: chargebackData.caseNumber,
      network: chargebackData.network,
      reasonCode: chargebackData.reasonCode,
      reasonDescription: chargebackData.reasonDescription,
      disputeAmount: chargebackData.disputeAmount,
      deadlineDate,
      status: 'OPEN',
    });

    return formatChargeback(chargeback);
  } catch (error) {
    if (error.code === 11000) {
      throw new AppError(
        'Chargeback with this caseNumber already exists for this merchant',
        409,
        'DUPLICATE_CHARGEBACK'
      );
    }
    throw error;
  }
}

/**
 * Retrieves a paginated and filtered list of chargebacks strictly for the authenticated merchant.
 *
 * @param {string} merchantId - Authenticated merchant ObjectId
 * @param {Object} filters - Query filters
 * @param {Object} pagination - Pagination options
 * @returns {Promise<Object>} Formatted chargebacks with pagination envelope
 */
async function getChargebacks(merchantId, filters = {}, pagination = {}) {
  const page = Math.max(1, parseInt(pagination.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(pagination.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const query = { merchantId };

  if (filters.status) {
    query.status = filters.status;
  }

  if (filters.network) {
    query.network = filters.network;
  }

  if (filters.reasonCode) {
    query.reasonCode = filters.reasonCode;
  }

  if (filters.transactionId) {
    query.transactionId = filters.transactionId;
  }

  if (filters.from || filters.to) {
    query.createdAt = {};
    if (filters.from) query.createdAt.$gte = new Date(filters.from);
    if (filters.to) query.createdAt.$lte = new Date(filters.to);
  }

  if (filters.deadlineFrom || filters.deadlineTo) {
    query.deadlineDate = {};
    if (filters.deadlineFrom) query.deadlineDate.$gte = new Date(filters.deadlineFrom);
    if (filters.deadlineTo) query.deadlineDate.$lte = new Date(filters.deadlineTo);
  }

  const sortField = filters.sortBy || 'createdAt';
  const sortDirection = filters.sortOrder === 'asc' ? 1 : -1;
  const sort = { [sortField]: sortDirection };

  const [docs, total] = await Promise.all([
    Chargeback.find(query).sort(sort).skip(skip).limit(limit).lean(),
    Chargeback.countDocuments(query),
  ]);

  const items = docs.map((doc) => formatChargeback(doc));
  const totalPages = Math.ceil(total / limit);

  return {
    items,
    data: items,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      pages: totalPages,
    },
  };
}

/**
 * Retrieves a single chargeback by ID strictly scoped to the authenticated merchant.
 *
 * @param {string} merchantId - Authenticated merchant ObjectId
 * @param {string} id - Chargeback ObjectId
 * @returns {Promise<Object>} Formatted chargeback document
 */
async function getChargebackById(merchantId, id) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError('Invalid chargeback ID', 400, 'VALIDATION_ERROR');
  }

  const chargeback = await Chargeback.findOne({
    _id: id,
    merchantId,
  });

  if (!chargeback) {
    throw new AppError('Chargeback not found', 404, 'CHARGEBACK_NOT_FOUND');
  }

  return formatChargeback(chargeback);
}

/**
 * Updates a chargeback's lifecycle status with strict state machine validation and audit logging.
 *
 * @param {string} merchantId - Authenticated merchant ObjectId
 * @param {string} id - Chargeback ObjectId
 * @param {string} targetStatus - New lifecycle status
 * @param {string} [reason] - Optional explanation for transition
 * @returns {Promise<Object>} Formatted updated chargeback document
 */
async function updateChargebackStatus(merchantId, id, targetStatus, reason) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError('Invalid chargeback ID', 400, 'VALIDATION_ERROR');
  }

  const chargeback = await Chargeback.findOne({
    _id: id,
    merchantId,
  });

  if (!chargeback) {
    throw new AppError('Chargeback not found', 404, 'CHARGEBACK_NOT_FOUND');
  }

  const previousStatus = chargeback.status;

  // Enforce valid lifecycle state transition
  validateStatusTransition(previousStatus, targetStatus);

  chargeback.status = targetStatus;
  await chargeback.save();

  // Create AuditLog entry for successful state transition (guarded by active connection)
  if (mongoose.connection.readyState === 1) {
    try {
      await AuditLog.create({
        entityType: 'CHARGEBACK',
        entityId: chargeback._id,
        actorId: merchantId.toString(),
        actorType: 'MERCHANT',
        action: 'STATUS_CHANGED',
        previousState: { status: previousStatus },
        newState: { status: targetStatus },
        reason: reason || 'Status updated',
        timestamp: new Date(),
      });
    } catch (auditErr) {
      // Log error but do not fail business operation
      console.error('Failed to create AuditLog entry:', auditErr.message);
    }
  }

  return formatChargeback(chargeback);
}

module.exports = {
  computeDeadlineStatus,
  validateStatusTransition,
  formatChargeback,
  createChargeback,
  getChargebacks,
  getChargebackById,
  updateChargebackStatus,
};
