const evidenceService = require('../services/evidenceService');

/**
 * Controller to handle evidence creation for a specific chargeback.
 * Scoped strictly to the authenticated merchant.
 * Responds with HTTP 201 Created.
 */
async function createEvidence(req, res, next) {
  try {
    const evidence = await evidenceService.createEvidence(
      req.user.merchantId,
      req.params.chargebackId,
      req.body
    );
    res.status(201).json({
      success: true,
      data: evidence,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Controller to list all evidence associated with a chargeback.
 * Scoped strictly to the authenticated merchant.
 * Responds with HTTP 200 OK.
 */
async function listEvidence(req, res, next) {
  try {
    const { page, limit, type, source, from, to, sortBy, sortOrder } = req.query;
    const result = await evidenceService.listEvidenceForChargeback(
      req.user.merchantId,
      req.params.chargebackId,
      { type, source, from, to, sortBy, sortOrder },
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
 * Controller to retrieve a single evidence document by ID.
 * Scoped strictly to the authenticated merchant.
 * Responds with HTTP 200 OK.
 */
async function getEvidenceById(req, res, next) {
  try {
    const evidence = await evidenceService.getEvidenceById(
      req.user.merchantId,
      req.params.chargebackId,
      req.params.evidenceId
    );
    res.status(200).json({
      success: true,
      data: evidence,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Controller to update evidence metadata.
 * Scoped strictly to the authenticated merchant.
 * Responds with HTTP 200 OK.
 */
async function updateEvidence(req, res, next) {
  try {
    const evidence = await evidenceService.updateEvidence(
      req.user.merchantId,
      req.params.chargebackId,
      req.params.evidenceId,
      req.body
    );
    res.status(200).json({
      success: true,
      data: evidence,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Controller to delete an evidence record.
 * Scoped strictly to the authenticated merchant.
 * Responds with HTTP 200 OK.
 */
async function deleteEvidence(req, res, next) {
  try {
    const result = await evidenceService.deleteEvidence(
      req.user.merchantId,
      req.params.chargebackId,
      req.params.evidenceId
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * Controller to build and retrieve the deterministic evidence index.
 * Scoped strictly to the authenticated merchant.
 * Responds with HTTP 200 OK.
 */
async function getEvidenceIndex(req, res, next) {
  try {
    const index = await evidenceService.buildEvidenceIndex(
      req.user.merchantId,
      req.params.chargebackId
    );
    res.status(200).json({
      success: true,
      data: index,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createEvidence,
  listEvidence,
  getEvidenceById,
  updateEvidence,
  deleteEvidence,
  getEvidenceIndex,
};
