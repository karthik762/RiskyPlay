const riskService = require('../services/riskService');

/**
 * Controller to execute deterministic risk assessment on a transaction and persist result.
 * Strictly derives merchant identity from req.user.merchantId.
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
      data: assessment,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Controller to retrieve the latest risk assessment for a transaction.
 * Strictly scoped to the authenticated merchant.
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
      data: assessment,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  assessTransactionRisk,
  getLatestRiskAssessment,
};
