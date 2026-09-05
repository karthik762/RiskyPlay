const mongoose = require('mongoose');
const { Evidence, Chargeback, Transaction, AuditLog } = require('../models');
const AppError = require('../utils/AppError');

/**
 * Formats an Evidence document into a sanitized, tenant-safe client response.
 * Excludes internal MongoDB fields and ensures credentials/secrets are never returned.
 *
 * @param {Object} evidence - Mongoose Evidence document or plain object
 * @returns {Object} Sanitized evidence payload
 */
function formatEvidence(evidence) {
  const doc = evidence.toObject ? evidence.toObject() : evidence;

  const formatted = {
    id: (doc._id || doc.id).toString(),
    merchantId: doc.merchantId.toString(),
    chargebackId: doc.chargebackId.toString(),
    transactionId: doc.transactionId ? doc.transactionId.toString() : null,
    type: doc.type,
    title: doc.title,
    description: doc.description || null,
    source: doc.source || 'MANUAL',
    fileMetadata: doc.fileMetadata
      ? {
          filename: doc.fileMetadata.filename || null,
          mimeType: doc.fileMetadata.mimeType || null,
          sizeBytes: doc.fileMetadata.sizeBytes !== undefined ? doc.fileMetadata.sizeBytes : null,
          storageKey: doc.fileMetadata.storageKey || null,
        }
      : null,
    extractedFacts: (doc.extractedFacts || []).map((f) => ({
      key: f.key,
      value: f.value,
      confidence: f.confidence !== undefined ? f.confidence : 1.0,
      verified: Boolean(f.verified),
    })),
    collectedAt: doc.collectedAt || doc.createdAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };

  return formatted;
}

/**
 * Creates a new Evidence record linked to an existing merchant chargeback.
 *
 * @param {string} merchantId - Authenticated merchant ObjectId
 * @param {string} chargebackId - Chargeback ObjectId
 * @param {Object} data - Validated evidence input data
 * @returns {Promise<Object>} Formatted created evidence
 */
async function createEvidence(merchantId, chargebackId, data) {
  if (!mongoose.Types.ObjectId.isValid(chargebackId)) {
    throw new AppError('Invalid chargeback ID', 400, 'VALIDATION_ERROR');
  }

  // 1. Resolve Chargeback strictly within merchant tenant boundary
  const chargeback = await Chargeback.findOne({
    _id: chargebackId,
    merchantId,
  });

  if (!chargeback) {
    throw new AppError('Chargeback not found', 404, 'CHARGEBACK_NOT_FOUND');
  }

  // 2. Prevent attaching evidence to a finalized/closed case
  if (chargeback.status === 'CLOSED') {
    throw new AppError(
      'Cannot attach evidence to a CLOSED chargeback',
      400,
      'INVALID_EVIDENCE_OPERATION'
    );
  }

  // 3. Verify transactionId consistency
  let targetTransactionId = chargeback.transactionId;
  if (data.transactionId) {
    if (data.transactionId.toString() !== chargeback.transactionId.toString()) {
      throw new AppError(
        'Evidence transactionId does not match chargeback transactionId',
        400,
        'VALIDATION_ERROR'
      );
    }
    targetTransactionId = data.transactionId;
  }

  // 4. Create and persist Evidence document
  const { merchantId: _ignored, ...evidenceData } = data;
  const evidence = await Evidence.create({
    merchantId,
    chargebackId: chargeback._id,
    transactionId: targetTransactionId,
    type: evidenceData.type,
    title: evidenceData.title,
    description: evidenceData.description,
    source: evidenceData.source || 'MANUAL',
    fileMetadata: evidenceData.fileMetadata,
    extractedFacts: evidenceData.extractedFacts || [],
    collectedAt: evidenceData.collectedAt || new Date(),
  });

  // 5. Increment evidenceCount on Chargeback summary
  if (mongoose.connection.readyState === 1) {
    try {
      await Chargeback.updateOne(
        { _id: chargeback._id },
        { $inc: { 'evidenceSummary.evidenceCount': 1 } }
      );

      // Record AuditLog
      await AuditLog.create({
        entityType: 'EVIDENCE',
        entityId: evidence._id,
        actorId: merchantId.toString(),
        actorType: 'MERCHANT',
        action: 'EVIDENCE_CREATED',
        reason: `Evidence created: ${evidence.title} (${evidence.type})`,
        timestamp: new Date(),
      });
    } catch (err) {
      console.error('AuditLog or Chargeback summary update failed:', err.message);
    }
  }

  return formatEvidence(evidence);
}

/**
 * Retrieves a paginated and filtered list of evidence records for a given chargeback.
 *
 * @param {string} merchantId - Authenticated merchant ObjectId
 * @param {string} chargebackId - Chargeback ObjectId
 * @param {Object} [filters] - Optional filter options
 * @param {Object} [pagination] - Pagination options (page, limit)
 * @returns {Promise<Object>} Formatted evidence items with pagination envelope
 */
async function listEvidenceForChargeback(merchantId, chargebackId, filters = {}, pagination = {}) {
  if (!mongoose.Types.ObjectId.isValid(chargebackId)) {
    throw new AppError('Invalid chargeback ID', 400, 'VALIDATION_ERROR');
  }

  // Verify chargeback ownership
  const chargeback = await Chargeback.findOne({
    _id: chargebackId,
    merchantId,
  });

  if (!chargeback) {
    throw new AppError('Chargeback not found', 404, 'CHARGEBACK_NOT_FOUND');
  }

  const page = Math.max(1, parseInt(pagination.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(pagination.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const query = {
    merchantId,
    chargebackId: chargeback._id,
  };

  if (filters.type) {
    query.type = filters.type;
  }

  if (filters.source) {
    query.source = filters.source;
  }

  if (filters.from || filters.to) {
    query.createdAt = {};
    if (filters.from) query.createdAt.$gte = new Date(filters.from);
    if (filters.to) query.createdAt.$lte = new Date(filters.to);
  }

  const sortField = filters.sortBy || 'createdAt';
  const sortDirection = filters.sortOrder === 'asc' ? 1 : -1;
  const sort = { [sortField]: sortDirection };

  const [docs, total] = await Promise.all([
    Evidence.find(query).sort(sort).skip(skip).limit(limit).lean(),
    Evidence.countDocuments(query),
  ]);

  const items = docs.map((doc) => formatEvidence(doc));
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
 * Retrieves a single evidence document by its ID strictly within merchant scope.
 *
 * @param {string} merchantId - Authenticated merchant ObjectId
 * @param {string} chargebackId - Chargeback ObjectId
 * @param {string} evidenceId - Evidence ObjectId
 * @returns {Promise<Object>} Formatted evidence document
 */
async function getEvidenceById(merchantId, chargebackId, evidenceId) {
  if (!mongoose.Types.ObjectId.isValid(chargebackId)) {
    throw new AppError('Invalid chargeback ID', 400, 'VALIDATION_ERROR');
  }
  if (!mongoose.Types.ObjectId.isValid(evidenceId)) {
    throw new AppError('Invalid evidence ID', 400, 'VALIDATION_ERROR');
  }

  const evidence = await Evidence.findOne({
    _id: evidenceId,
    chargebackId,
    merchantId,
  });

  if (!evidence) {
    throw new AppError('Evidence not found', 404, 'EVIDENCE_NOT_FOUND');
  }

  return formatEvidence(evidence);
}

/**
 * Updates permitted metadata and extracted facts on an existing evidence document.
 *
 * @param {string} merchantId - Authenticated merchant ObjectId
 * @param {string} chargebackId - Chargeback ObjectId
 * @param {string} evidenceId - Evidence ObjectId
 * @param {Object} data - Update data
 * @returns {Promise<Object>} Formatted updated evidence document
 */
async function updateEvidence(merchantId, chargebackId, evidenceId, data) {
  if (!mongoose.Types.ObjectId.isValid(chargebackId) || !mongoose.Types.ObjectId.isValid(evidenceId)) {
    throw new AppError('Invalid ID format', 400, 'VALIDATION_ERROR');
  }

  const evidence = await Evidence.findOne({
    _id: evidenceId,
    chargebackId,
    merchantId,
  });

  if (!evidence) {
    throw new AppError('Evidence not found', 404, 'EVIDENCE_NOT_FOUND');
  }

  // Check chargeback status
  const chargeback = await Chargeback.findOne({ _id: chargebackId, merchantId });
  if (chargeback && chargeback.status === 'CLOSED') {
    throw new AppError('Cannot update evidence for a CLOSED chargeback', 400, 'INVALID_EVIDENCE_OPERATION');
  }

  // Update allowed fields
  if (data.title !== undefined) evidence.title = data.title;
  if (data.description !== undefined) evidence.description = data.description;
  if (data.type !== undefined) evidence.type = data.type;
  if (data.source !== undefined) evidence.source = data.source;
  if (data.fileMetadata !== undefined) evidence.fileMetadata = data.fileMetadata;
  if (data.extractedFacts !== undefined) evidence.extractedFacts = data.extractedFacts;

  await evidence.save();

  if (mongoose.connection.readyState === 1) {
    try {
      await AuditLog.create({
        entityType: 'EVIDENCE',
        entityId: evidence._id,
        actorId: merchantId.toString(),
        actorType: 'MERCHANT',
        action: 'EVIDENCE_UPDATED',
        reason: 'Evidence metadata updated',
        timestamp: new Date(),
      });
    } catch (err) {
      console.error('AuditLog creation failed:', err.message);
    }
  }

  return formatEvidence(evidence);
}

/**
 * Deletes an evidence document if the chargeback lifecycle permits it.
 *
 * @param {string} merchantId - Authenticated merchant ObjectId
 * @param {string} chargebackId - Chargeback ObjectId
 * @param {string} evidenceId - Evidence ObjectId
 * @returns {Promise<Object>} Deletion result confirmation
 */
async function deleteEvidence(merchantId, chargebackId, evidenceId) {
  if (!mongoose.Types.ObjectId.isValid(chargebackId) || !mongoose.Types.ObjectId.isValid(evidenceId)) {
    throw new AppError('Invalid ID format', 400, 'VALIDATION_ERROR');
  }

  // Verify chargeback exists and lifecycle allows deletion
  const chargeback = await Chargeback.findOne({ _id: chargebackId, merchantId });
  if (!chargeback) {
    throw new AppError('Chargeback not found', 404, 'CHARGEBACK_NOT_FOUND');
  }

  const lockedStatuses = ['SUBMITTED', 'WON', 'LOST', 'CLOSED'];
  if (lockedStatuses.includes(chargeback.status)) {
    throw new AppError(
      `Cannot delete evidence when chargeback is in status '${chargeback.status}'`,
      400,
      'INVALID_EVIDENCE_OPERATION'
    );
  }

  const deleted = await Evidence.findOneAndDelete({
    _id: evidenceId,
    chargebackId,
    merchantId,
  });

  if (!deleted) {
    throw new AppError('Evidence not found', 404, 'EVIDENCE_NOT_FOUND');
  }

  // Decrement evidenceCount on Chargeback summary
  if (mongoose.connection.readyState === 1) {
    try {
      await Chargeback.updateOne(
        { _id: chargeback._id },
        { $inc: { 'evidenceSummary.evidenceCount': -1 } }
      );

      await AuditLog.create({
        entityType: 'EVIDENCE',
        entityId: deleted._id,
        actorId: merchantId.toString(),
        actorType: 'MERCHANT',
        action: 'EVIDENCE_DELETED',
        reason: `Evidence deleted: ${deleted.title}`,
        timestamp: new Date(),
      });
    } catch (err) {
      console.error('AuditLog or Chargeback summary update failed:', err.message);
    }
  }

  return {
    success: true,
    message: 'Evidence deleted successfully',
  };
}

/**
 * Builds a deterministic evidence index and runs observable consistency checks.
 *
 * @param {string} merchantId - Authenticated merchant ObjectId
 * @param {string} chargebackId - Chargeback ObjectId
 * @returns {Promise<Object>} Structured evidence index with consistency warnings
 */
async function buildEvidenceIndex(merchantId, chargebackId) {
  if (!mongoose.Types.ObjectId.isValid(chargebackId)) {
    throw new AppError('Invalid chargeback ID', 400, 'VALIDATION_ERROR');
  }

  // 1. Resolve Chargeback and associated Transaction
  const chargeback = await Chargeback.findOne({ _id: chargebackId, merchantId });
  if (!chargeback) {
    throw new AppError('Chargeback not found', 404, 'CHARGEBACK_NOT_FOUND');
  }

  const transaction = await Transaction.findOne({
    _id: chargeback.transactionId,
    merchantId,
  }).lean();

  // 2. Fetch all evidence records sorted deterministically by createdAt ASC, _id ASC
  const evidenceList = await Evidence.find({ merchantId, chargebackId })
    .sort({ createdAt: 1, _id: 1 })
    .lean();

  // 3. Category distribution
  const categories = {
    ORDER: 0,
    PAYMENT: 0,
    CUSTOMER: 0,
    SHIPPING: 0,
    DELIVERY: 0,
    COMMUNICATION: 0,
    REFUND: 0,
    PRODUCT: 0,
    IDENTITY: 0,
    OTHER: 0,
  };

  for (const ev of evidenceList) {
    const cat = ev.type;
    if (categories[cat] !== undefined) {
      categories[cat] += 1;
    } else {
      // Map legacy categories if present
      if (cat === 'CARRIER_PROOF') categories.DELIVERY += 1;
      else if (cat === 'RECEIPT') categories.ORDER += 1;
      else if (cat === 'CUSTOMER_COMMUNICATION') categories.COMMUNICATION += 1;
      else if (cat === 'TERMS_ACCEPTANCE') categories.CUSTOMER += 1;
      else categories.OTHER += 1;
    }
  }

  // 4. Extract and sort observable facts
  const facts = [];
  for (const ev of evidenceList) {
    for (const fact of ev.extractedFacts || []) {
      facts.push({
        sourceEvidenceId: ev._id.toString(),
        category: ev.type,
        fact: fact.key,
        value: fact.value,
        confidence: fact.confidence !== undefined ? fact.confidence : 1.0,
        verified: Boolean(fact.verified),
      });
    }
  }

  // Deterministic fact ordering: category ASC, fact ASC, sourceEvidenceId ASC
  facts.sort((a, b) => {
    const catCmp = a.category.localeCompare(b.category);
    if (catCmp !== 0) return catCmp;
    const factCmp = a.fact.localeCompare(b.fact);
    if (factCmp !== 0) return factCmp;
    return a.sourceEvidenceId.localeCompare(b.sourceEvidenceId);
  });

  // 5. Category coverage booleans
  const coverage = {
    order: categories.ORDER > 0,
    payment: categories.PAYMENT > 0,
    shipping: categories.SHIPPING > 0,
    delivery: categories.DELIVERY > 0,
    communication: categories.COMMUNICATION > 0,
    refund: categories.REFUND > 0,
    customer: categories.CUSTOMER > 0,
    identity: categories.IDENTITY > 0,
    product: categories.PRODUCT > 0,
  };

  // 6. Consistency checks against transaction and dispute metadata
  const warnings = [];

  // Check: Evidence transactionId consistency
  for (const ev of evidenceList) {
    if (ev.transactionId.toString() !== chargeback.transactionId.toString()) {
      warnings.push({
        code: 'TRANSACTION_ID_MISMATCH',
        severity: 'WARNING',
        message: `Evidence '${ev.title}' references transactionId ${ev.transactionId} which differs from chargeback transaction ${chargeback.transactionId}`,
      });
    }
  }

  // Check: Extracted amounts consistency
  if (transaction) {
    for (const fact of facts) {
      if (fact.fact === 'orderAmount' || fact.fact === 'order_amount') {
        const numVal = parseFloat(fact.value);
        if (!isNaN(numVal) && Math.abs(numVal - transaction.amount) > 0.01) {
          warnings.push({
            code: 'ORDER_AMOUNT_MISMATCH',
            severity: 'WARNING',
            message: `Evidence orderAmount (${numVal}) conflicts with transaction amount (${transaction.amount})`,
          });
        }
      }

      if (fact.fact === 'refundAmount' || fact.fact === 'refund_amount') {
        const refundVal = parseFloat(fact.value);
        if (!isNaN(refundVal) && refundVal > transaction.amount) {
          warnings.push({
            code: 'REFUND_EXCEEDS_DISPUTE',
            severity: 'WARNING',
            message: `Extracted refundAmount (${refundVal}) exceeds transaction total (${transaction.amount})`,
          });
        }
      }
    }
  }

  // Check: Chronological consistency (e.g. delivery before order)
  let extractedDeliveredAt = null;
  let extractedOrderAt = null;

  for (const fact of facts) {
    if (fact.fact === 'deliveredAt' || fact.fact === 'deliveryTimestamp') {
      const parsed = new Date(fact.value);
      if (!isNaN(parsed.getTime())) extractedDeliveredAt = parsed;
    }
    if (fact.fact === 'orderAt' || fact.fact === 'orderTimestamp') {
      const parsed = new Date(fact.value);
      if (!isNaN(parsed.getTime())) extractedOrderAt = parsed;
    }
  }

  if (extractedDeliveredAt && extractedOrderAt) {
    if (extractedDeliveredAt.getTime() < extractedOrderAt.getTime()) {
      warnings.push({
        code: 'DELIVERY_BEFORE_ORDER',
        severity: 'WARNING',
        message: `Delivered timestamp (${extractedDeliveredAt.toISOString()}) occurs before order timestamp (${extractedOrderAt.toISOString()})`,
      });
    }
  }

  const generatedAt = new Date();

  // 7. Update Chargeback evidenceSummary with coverage and count
  if (mongoose.connection.readyState === 1) {
    try {
      chargeback.evidenceSummary = {
        evidenceCount: evidenceList.length,
        coverage,
        lastIndexedAt: generatedAt,
      };
      await chargeback.save();

      await AuditLog.create({
        entityType: 'CHARGEBACK',
        entityId: chargeback._id,
        actorId: merchantId.toString(),
        actorType: 'MERCHANT',
        action: 'EVIDENCE_INDEX_BUILT',
        reason: `Evidence index generated with ${evidenceList.length} items and ${facts.length} facts`,
        timestamp: generatedAt,
      });
    } catch (err) {
      console.error('AuditLog or Chargeback index update failed:', err.message);
    }
  }

  return {
    chargebackId: chargeback._id.toString(),
    transactionId: chargeback.transactionId.toString(),
    caseNumber: chargeback.caseNumber,
    evidenceCount: evidenceList.length,
    categories,
    facts,
    coverage,
    warnings,
    generatedAt,
  };
}

module.exports = {
  formatEvidence,
  createEvidence,
  listEvidenceForChargeback,
  getEvidenceById,
  updateEvidence,
  deleteEvidence,
  buildEvidenceIndex,
};
