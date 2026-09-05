/**
 * Controller for Merchant Dashboard statistics and summary metrics.
 */

'use strict';

const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const Chargeback = require('../models/Chargeback');
const RiskAssessment = require('../models/RiskAssessment');
const AgentTrace = require('../models/AgentTrace');

/**
 * GET /api/v1/dashboard/stats
 * Return aggregated merchant risk, chargeback, and multi-agent metrics.
 */
exports.getDashboardStats = async (req, res, next) => {
  try {
    const rawId = req.user?.merchantId || req.merchant?._id || req.merchant?.id;
    if (!rawId) {
      return res.status(401).json({ success: false, message: 'Merchant context not found' });
    }
    const merchantId = mongoose.Types.ObjectId.isValid(rawId)
      ? new mongoose.Types.ObjectId(rawId)
      : rawId;

    // 1. Transaction aggregations
    const txStats = await Transaction.aggregate([
      { $match: { merchantId } },
      {
        $group: {
          _id: null,
          totalCount: { $sum: 1 },
          totalVolume: { $sum: '$amount' },
          approvedCount: {
            $sum: { $cond: [{ $eq: ['$status', 'APPROVED'] }, 1, 0] },
          },
          pendingCount: {
            $sum: { $cond: [{ $eq: ['$status', 'MANUAL_REVIEW'] }, 1, 0] },
          },
          failedCount: {
            $sum: { $cond: [{ $eq: ['$status', 'DECLINED'] }, 1, 0] },
          },
        },
      },
    ]);

    const txSummary = txStats[0] || {
      totalCount: 0,
      totalVolume: 0,
      approvedCount: 0,
      pendingCount: 0,
      failedCount: 0,
    };

    // 2. Risk assessment distribution
    const riskStats = await RiskAssessment.aggregate([
      { $match: { merchantId } },
      {
        $group: {
          _id: '$riskTier',
          count: { $sum: 1 },
        },
      },
    ]);

    const riskDistribution = { LOW: 0, MEDIUM: 0, HIGH: 0 };
    for (const r of riskStats) {
      if (r._id && riskDistribution[r._id] !== undefined) {
        riskDistribution[r._id] = r.count;
      }
    }

    // 3. Chargeback aggregations
    const cbStats = await Chargeback.aggregate([
      { $match: { merchantId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
        },
      },
    ]);

    const chargebacksByStatus = {
      OPEN: 0,
      UNDER_REVIEW: 0,
      RESPONSE_READY: 0,
      SUBMITTED: 0,
      WON: 0,
      LOST: 0,
      CLOSED: 0,
    };

    let totalChargebackCount = 0;
    let totalChargebackAmount = 0;
    let wonCount = 0;
    let lostCount = 0;
    let wonAmount = 0;

    for (const cb of cbStats) {
      if (cb._id && chargebacksByStatus[cb._id] !== undefined) {
        chargebacksByStatus[cb._id] = cb.count;
      }
      totalChargebackCount += cb.count;
      totalChargebackAmount += cb.totalAmount;

      if (cb._id === 'WON') {
        wonCount += cb.count;
        wonAmount += cb.totalAmount;
      } else if (cb._id === 'LOST') {
        lostCount += cb.count;
      }
    }

    const resolvedCount = wonCount + lostCount;
    const winRate = resolvedCount > 0 ? Math.round((wonCount / resolvedCount) * 100) : 0;
    const chargebackRate =
      txSummary.totalCount > 0
        ? Number(((totalChargebackCount / txSummary.totalCount) * 100).toFixed(2))
        : 0;

    // 4. Agent metrics (find traces where entity is merchant's transaction or chargeback)
    const merchantTxIds = await Transaction.find({ merchantId }).select('_id');
    const merchantCbIds = await Chargeback.find({ merchantId }).select('_id');
    const allEntityIds = [
      ...merchantTxIds.map((t) => t._id),
      ...merchantCbIds.map((c) => c._id),
    ];

    const agentStats = await AgentTrace.aggregate([
      { $match: { entityId: { $in: allEntityIds } } },
      {
        $group: {
          _id: null,
          totalTraces: { $sum: 1 },
          avgLatencyMs: { $avg: '$latencyMs' },
          totalTokens: { $sum: '$tokensUsed' },
          completedTraces: {
            $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] },
          },
        },
      },
    ]);

    const agentSummary = agentStats[0] || {
      totalTraces: 0,
      avgLatencyMs: 0,
      totalTokens: 0,
      completedTraces: 0,
    };

    // 5. Recent transactions and chargebacks
    const recentTransactions = await Transaction.find({ merchantId })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    const recentChargebacks = await Chargeback.find({ merchantId })
      .populate('transactionId', 'amount currency cardholder email')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    return res.status(200).json({
      success: true,
      data: {
        transactions: {
          totalCount: txSummary.totalCount,
          totalVolume: txSummary.totalVolume,
          approvedCount: txSummary.approvedCount,
          pendingCount: txSummary.pendingCount,
          failedCount: txSummary.failedCount,
        },
        risk: {
          distribution: riskDistribution,
          totalAssessed:
            riskDistribution.LOW + riskDistribution.MEDIUM + riskDistribution.HIGH,
        },
        chargebacks: {
          totalCount: totalChargebackCount,
          totalAmount: totalChargebackAmount,
          chargebackRate,
          winRate,
          wonCount,
          lostCount,
          wonAmount,
          byStatus: chargebacksByStatus,
        },
        defenseMetrics: {
          potentialLossProtected: wonAmount,
          agentTracesCount: agentSummary.totalTraces,
          avgLatencyMs: Math.round(agentSummary.avgLatencyMs || 0),
          totalTokensUsed: agentSummary.totalTokens,
        },
        recentTransactions,
        recentChargebacks,
      },
    });
  } catch (error) {
    next(error);
  }
};
