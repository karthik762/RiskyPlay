const mongoose = require('mongoose');
const riskService = require('../services/riskService');
const { defaultOrchestrator } = require('../agents');
const { Transaction } = require('../models');
const AppError = require('../utils/AppError');

/**
 * Controller to execute deterministic risk assessment on a transaction and persist result.
 * Strictly derives merchant identity from req.user.merchantId.
 * Formats response according to the risk API response contract.
 * Responds with HTTP 201 on success.
 */
async function assessTransactionRisk(req, res, next) {
  try {
    const assessment = await riskService.assessAndPersistRisk(
      req.user.merchantId,
      req.params.id
    );
    res.status(201).json({
      success: true,
      data: riskService.formatRiskAssessment(assessment),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Controller to retrieve the latest risk assessment for a transaction.
 * Strictly scoped to the authenticated merchant.
 * Formats response according to the risk API response contract.
 * Responds with HTTP 200 on success.
 */
async function getLatestRiskAssessment(req, res, next) {
  try {
    const assessment = await riskService.getLatestAssessment(
      req.user.merchantId,
      req.params.id
    );
    res.status(200).json({
      success: true,
      data: riskService.formatRiskAssessment(assessment),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Controller to execute multi-agent orchestration for a transaction.
 * Strictly verifies tenant isolation by querying for transaction with both _id and merchantId.
 * Returns HTTP 200 with structured orchestration results.
 */
async function orchestrateTransactionRisk(req, res, next) {
  try {
    const merchantId = req.user.merchantId;
    const transactionId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(transactionId)) {
      throw new AppError('Invalid transaction ID', 400, 'VALIDATION_ERROR');
    }

    // 1. Verify transaction exists and strictly belongs to authenticated merchant
    const transaction = await Transaction.findOne({
      _id: transactionId,
      merchantId,
    });

    if (!transaction) {
      throw new AppError('Transaction not found', 404, 'TRANSACTION_NOT_FOUND');
    }

    // 2. Execute orchestration pipeline
    const orchestrationResult = await defaultOrchestrator.orchestrate({
      merchantId: merchantId.toString(),
      transactionId: transaction._id.toString(),
      transaction,
    });

    res.status(200).json({
      success: true,
      data: orchestrationResult,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  assessTransactionRisk,
  getLatestRiskAssessment,
  orchestrateTransactionRisk,
};
