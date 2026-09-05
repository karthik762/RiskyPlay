/**
 * Chargeback Response Controller.
 * Handles HTTP requests for defensive chargeback response generation, retrieval, and verification.
 */

'use strict';

const chargebackResponseService = require('../services/chargebackResponseService');

/**
 * Generates an automated defensive response draft for a chargeback.
 * Executes multi-agent workflow, deterministic decision policy, and persists the response.
 * Responds with HTTP 201 Created.
 */
async function generateResponse(req, res, next) {
  try {
    const result = await chargebackResponseService.generateResponse(
      req.user.merchantId,
      req.params.chargebackId
    );

    res.status(201).json({
      success: true,
      data: result.response,
      response: result.response,
      orchestration: result.orchestration,
      decision: result.decision,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Retrieves the latest defensive response draft for a chargeback.
 * Responds with HTTP 200 OK.
 */
async function getResponse(req, res, next) {
  try {
    const response = await chargebackResponseService.getResponse(
      req.user.merchantId,
      req.params.chargebackId
    );

    res.status(200).json({
      success: true,
      data: response,
      response,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Re-runs deterministic verification on an existing response or overrides.
 * Responds with HTTP 200 OK.
 */
async function verifyResponse(req, res, next) {
  try {
    const response = await chargebackResponseService.verifyResponse(
      req.user.merchantId,
      req.params.chargebackId,
      req.body || {}
    );

    res.status(200).json({
      success: true,
      data: response,
      response,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  generateResponse,
  getResponse,
  verifyResponse,
};
