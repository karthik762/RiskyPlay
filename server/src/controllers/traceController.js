/**
 * Controller for retrieving Agent Traces.
 */

'use strict';

const mongoose = require('mongoose');
const AgentTrace = require('../models/AgentTrace');
const Transaction = require('../models/Transaction');
const Chargeback = require('../models/Chargeback');

/**
 * Helper to verify merchant owns an entity (Transaction or Chargeback).
 */
async function verifyEntityOwnership(entityId, merchantId) {
  const [tx, cb] = await Promise.all([
    Transaction.findOne({ _id: entityId, merchantId }),
    Chargeback.findOne({ _id: entityId, merchantId }),
  ]);
  return Boolean(tx || cb);
}

/**
 * GET /api/v1/traces
 * List agent traces across merchant entities with optional filters.
 */
exports.getTraces = async (req, res, next) => {
  try {
    const rawId = req.user?.merchantId || req.merchant?._id || req.merchant?.id;
    if (!rawId) {
      return res.status(401).json({ success: false, message: 'Merchant context not found' });
    }
    const merchantId = mongoose.Types.ObjectId.isValid(rawId)
      ? new mongoose.Types.ObjectId(rawId)
      : rawId;

    const { runId, entityType, agentName, status, limit = 50, page = 1 } = req.query;

    // Retrieve all entity IDs owned by this merchant
    const [txs, cbs] = await Promise.all([
      Transaction.find({ merchantId }).select('_id'),
      Chargeback.find({ merchantId }).select('_id'),
    ]);

    const entityIds = [...txs.map((t) => t._id), ...cbs.map((c) => c._id)];

    const query = { entityId: { $in: entityIds } };

    if (runId) query.runId = runId;
    if (entityType) query.entityType = entityType;
    if (agentName) query.agentName = agentName;
    if (status) query.status = status;

    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
    const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
    const skip = (parsedPage - 1) * parsedLimit;

    const [traces, total] = await Promise.all([
      AgentTrace.find(query)
        .sort({ timestamp: -1, stepIndex: 1 })
        .skip(skip)
        .limit(parsedLimit)
        .lean(),
      AgentTrace.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      data: traces,
      pagination: {
        total,
        page: parsedPage,
        limit: parsedLimit,
        pages: Math.ceil(total / parsedLimit),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/traces/entity/:entityId
 * Retrieve execution traces for a specific transaction or chargeback.
 */
exports.getEntityTraces = async (req, res, next) => {
  try {
    const { entityId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(entityId)) {
      return res.status(400).json({
        success: false,
        error: { message: 'Invalid entity ID format' },
      });
    }

    const rawId = req.user?.merchantId || req.merchant?._id || req.merchant?.id;
    if (!rawId) {
      return res.status(401).json({ success: false, message: 'Merchant context not found' });
    }

    const isAuthorized = await verifyEntityOwnership(entityId, rawId);
    if (!isAuthorized) {
      return res.status(404).json({
        success: false,
        error: { message: 'Entity not found or access denied' },
      });
    }

    const traces = await AgentTrace.find({ entityId })
      .sort({ runId: 1, stepIndex: 1, timestamp: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: traces,
    });
  } catch (error) {
    next(error);
  }
};
