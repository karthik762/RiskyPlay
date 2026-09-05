const chargebackService = require('../services/chargebackService');

/**
 * Controller to handle chargeback creation.
 * Sets merchant ownership strictly from req.user.merchantId.
 * Responds with HTTP 201 on success.
 */
async function createChargeback(req, res, next) {
  try {
    const chargeback = await chargebackService.createChargeback(
      req.user.merchantId,
      req.body
    );
    res.status(201).json({
      success: true,
      data: chargeback,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Controller to handle listing and filtering chargebacks with pagination.
 * Strictly scoped to the authenticated merchant.
 * Responds with HTTP 200 on success.
 */
async function getChargebacks(req, res, next) {
  try {
    const {
      page,
      limit,
      status,
      network,
      reasonCode,
      transactionId,
      from,
      to,
      deadlineFrom,
      deadlineTo,
      sortBy,
      sortOrder,
    } = req.query;

    const result = await chargebackService.getChargebacks(
      req.user.merchantId,
      {
        status,
        network,
        reasonCode,
        transactionId,
        from,
        to,
        deadlineFrom,
        deadlineTo,
        sortBy,
        sortOrder,
      },
      { page, limit }
    );

    res.status(200).json({
      success: true,
      data: result.data,
      items: result.items,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Controller to retrieve a single chargeback by ID.
 * Strictly scoped to the authenticated merchant.
 * Responds with HTTP 200 on success.
 */
async function getChargebackById(req, res, next) {
  try {
    const chargeback = await chargebackService.getChargebackById(
      req.user.merchantId,
      req.params.id
    );
    res.status(200).json({
      success: true,
      data: chargeback,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Controller to update a chargeback's lifecycle status.
 * Strictly scoped to the authenticated merchant.
 * Responds with HTTP 200 on success.
 */
async function updateChargebackStatus(req, res, next) {
  try {
    const chargeback = await chargebackService.updateChargebackStatus(
      req.user.merchantId,
      req.params.id,
      req.body.status,
      req.body.reason
    );
    res.status(200).json({
      success: true,
      data: chargeback,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createChargeback,
  getChargebacks,
  getChargebackById,
  updateChargebackStatus,
};
