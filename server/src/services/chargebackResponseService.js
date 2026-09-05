/**
 * Chargeback Response Service.
 * Coordinates defensive response drafting, deterministic verification,
 * decision policy evaluation, and database persistence with tenant isolation.
 */

'use strict';

const mongoose = require('mongoose');
const { Chargeback, Transaction, ChargebackResponse, AuditLog } = require('../models');
const { defaultOrchestrator, CHARGEBACK_RESPONSE_WORKFLOW, AgentContext } = require('../agents');
const ChargebackResponseVerificationAgent = require('../agents/chargeback/ChargebackResponseVerificationAgent');
const evidenceService = require('./evidenceService');
const chargebackDecisionService = require('./chargebackDecisionService');
const AppError = require('../utils/AppError');

/**
 * Generates an evidence-grounded defensive response draft for a chargeback.
 *
 * @param {string} merchantId - Authenticated merchant ID
 * @param {string} chargebackId - Chargeback document ID
 * @returns {Promise<Object>} { response, orchestration, decision }
 */
async function generateResponse(merchantId, chargebackId) {
  if (!mongoose.Types.ObjectId.isValid(chargebackId)) {
    throw new AppError('Invalid chargeback ID', 400, 'VALIDATION_ERROR');
  }

  // 1. Resolve Chargeback strictly within merchant tenant boundary
  const chargeback = await Chargeback.findOne({
    _id: chargebackId,
    merchantId,
  });

  if (!chargeback) {
    throw new AppError('Chargeback not found', 404, 'RESOURCE_NOT_FOUND');
  }

  // 2. Resolve linked Transaction
  let transaction = null;
  if (chargeback.transactionId) {
    transaction = await Transaction.findOne({
      _id: chargeback.transactionId,
      merchantId,
    });
  }

  // 3. Build comprehensive evidence index
  const evidenceIndex = await evidenceService.buildEvidenceIndex(merchantId, chargebackId);

  // 4. Execute Multi-Agent Orchestration workflow
  const orchestration = await defaultOrchestrator.orchestrate({
    merchantId: merchantId.toString(),
    transactionId: (chargeback.transactionId || transaction?._id)?.toString(),
    chargebackId: chargebackId.toString(),
    chargeback,
    transaction,
    evidenceIndex,
    entityType: 'CHARGEBACK_REBUTTAL',
    agentNames: CHARGEBACK_RESPONSE_WORKFLOW,
  });

  const responseAgentResult = orchestration.agents.find(
    (a) => a.agentName === 'CHARGEBACK_RESPONSE'
  );
  const verificationAgentResult = orchestration.agents.find(
    (a) => a.agentName === 'CHARGEBACK_RESPONSE_VERIFICATION'
  );

  const aiOutput = responseAgentResult?.output;
  const verificationOutput = verificationAgentResult?.output;

  // 5. Authoritative Deterministic Decision Policy
  const decision = chargebackDecisionService.evaluateChargebackDecision({
    evidenceIndex,
    verification: verificationOutput,
    aiResponse: aiOutput,
  });

  // 6. Map Key Arguments & Evidence References
  const keyArguments = (aiOutput?.keyArguments || []).map((arg) => ({
    claim: arg.claim,
    evidenceIds: arg.evidenceItemIds || [],
  }));

  const evidenceReferences = Array.from(
    new Set(keyArguments.flatMap((a) => a.evidenceIds))
  );

  // 7. Map Unsupported Claims
  const unsupportedClaims = (verificationOutput?.unsupportedClaims || []).map((c) => ({
    code: c.claimType || 'UNSUPPORTED_CLAIM',
    claim: c.text || '',
    severity:
      c.claimType === 'UNSUPPORTED_FRAUD_CLAIM' || c.claimType === 'UNSUPPORTED_OUTCOME_CLAIM'
        ? 'ERROR'
        : 'WARNING',
    message: c.reason || 'Claim lacks factual grounding or violates defensive policy',
  }));

  // 8. Map Verification
  const verification = {
    status: verificationOutput?.status || 'DRAFT',
    warnings: (verificationOutput?.warnings || []).map((w) => ({
      code: 'VERIFICATION_WARNING',
      message: typeof w === 'string' ? w : w.message,
      severity: 'WARNING',
    })),
    scoreDelta: 0,
    isGroundingValid:
      verificationOutput?.status === 'VERIFIED' ||
      verificationOutput?.status === 'VERIFIED_WITH_WARNINGS',
    verifiedAt: verificationOutput?.verifiedAt ? new Date(verificationOutput.verifiedAt) : new Date(),
  };

  // Determine top-level response lifecycle status
  let responseStatus = 'DRAFT';
  if (verificationOutput?.status === 'VERIFIED') {
    responseStatus = 'VERIFIED';
  } else if (verificationOutput?.status === 'VERIFIED_WITH_WARNINGS') {
    responseStatus = 'VERIFIED_WITH_WARNINGS';
  } else if (verificationOutput?.status === 'REJECTED') {
    responseStatus = 'REJECTED';
  }

  // 9. Persist ChargebackResponse document
  const responseDoc = await ChargebackResponse.create({
    merchantId,
    chargebackId,
    transactionId: chargeback.transactionId || transaction?._id,
    responseText:
      aiOutput?.responseText ||
      'Defensive response draft could not be generated due to service unavailability.',
    responseSummary:
      aiOutput?.summary ||
      decision.reasons.join('. ') ||
      'Automated defensive response generation',
    keyArguments,
    evidenceReferences,
    unsupportedClaims,
    verification,
    recommendation: decision.recommendation,
    confidence: Math.round(decision.confidence * 100),
    coverage: evidenceIndex,
    status: responseStatus,
    generatedAt: new Date(),
  });

  // 10. Record AuditLog
  try {
    await AuditLog.create({
      entityType: 'ChargebackResponse',
      entityId: responseDoc._id,
      actorId: merchantId.toString(),
      actorType: 'MERCHANT',
      action: 'GENERATE_CHARGEBACK_RESPONSE',
      reason: `Generated defensive rebuttal response: ${decision.recommendation} (${responseDoc.confidence}%)`,
      newState: {
        recommendation: decision.recommendation,
        status: responseStatus,
        confidence: responseDoc.confidence,
        runId: orchestration.runId,
      },
      timestamp: new Date(),
    });
  } catch (auditErr) {
    console.error('AuditLog creation failed:', auditErr.message);
  }

  return {
    response: responseDoc,
    orchestration: {
      runId: orchestration.runId,
      status: orchestration.status,
      decision,
      agents: orchestration.agents,
    },
    decision,
  };
}

/**
 * Retrieves the latest defensive response draft for a chargeback.
 *
 * @param {string} merchantId - Authenticated merchant ID
 * @param {string} chargebackId - Chargeback document ID
 * @returns {Promise<Object>} Stored ChargebackResponse document
 */
async function getResponse(merchantId, chargebackId) {
  if (!mongoose.Types.ObjectId.isValid(chargebackId)) {
    throw new AppError('Invalid chargeback ID', 400, 'VALIDATION_ERROR');
  }

  const chargeback = await Chargeback.findOne({
    _id: chargebackId,
    merchantId,
  });

  if (!chargeback) {
    throw new AppError('Chargeback not found', 404, 'RESOURCE_NOT_FOUND');
  }

  const response = await ChargebackResponse.findOne({
    merchantId,
    chargebackId,
  }).sort({ createdAt: -1 });

  if (!response) {
    throw new AppError('No response found for this chargeback', 404, 'RESOURCE_NOT_FOUND');
  }

  return response;
}

/**
 * Deterministically verifies an existing or supplied defensive response.
 *
 * @param {string} merchantId - Authenticated merchant ID
 * @param {string} chargebackId - Chargeback document ID
 * @param {Object} [overrideData] - Optional manual override fields to verify
 * @returns {Promise<Object>} Updated/verified ChargebackResponse document
 */
async function verifyResponse(merchantId, chargebackId, overrideData = {}) {
  if (!mongoose.Types.ObjectId.isValid(chargebackId)) {
    throw new AppError('Invalid chargeback ID', 400, 'VALIDATION_ERROR');
  }

  const chargeback = await Chargeback.findOne({
    _id: chargebackId,
    merchantId,
  });

  if (!chargeback) {
    throw new AppError('Chargeback not found', 404, 'RESOURCE_NOT_FOUND');
  }

  let existingResponse = await ChargebackResponse.findOne({
    merchantId,
    chargebackId,
  }).sort({ createdAt: -1 });

  if (!existingResponse && !overrideData.responseText) {
    throw new AppError('No response exists to verify', 404, 'RESOURCE_NOT_FOUND');
  }

  let transaction = null;
  if (chargeback.transactionId) {
    transaction = await Transaction.findOne({
      _id: chargeback.transactionId,
      merchantId,
    });
  }

  const evidenceIndex = await evidenceService.buildEvidenceIndex(merchantId, chargebackId);

  const responseTextToVerify = overrideData.responseText || existingResponse?.responseText || '';
  const keyArgumentsToVerify = overrideData.keyArguments || existingResponse?.keyArguments || [];
  const summaryToVerify = overrideData.responseSummary || existingResponse?.responseSummary || '';

  // Pre-seed predecessor result in context so verifier has predecessor output
  const context = new AgentContext({
    runId: new mongoose.Types.ObjectId().toString(),
    merchantId: merchantId.toString(),
    transactionId: (chargeback.transactionId || transaction?._id)?.toString(),
    chargebackId: chargebackId.toString(),
    chargeback,
    transaction,
    evidenceIndex,
    entityType: 'CHARGEBACK_REBUTTAL',
    previousAgentResults: {
      CHARGEBACK_RESPONSE: {
        status: 'SUCCESS',
        responseText: responseTextToVerify,
        keyArguments: keyArgumentsToVerify.map((a) => ({
          claim: a.claim,
          evidenceItemIds: a.evidenceIds || a.evidenceItemIds || [],
        })),
        summary: summaryToVerify,
      },
    },
  });

  const verifier = new ChargebackResponseVerificationAgent();
  const verifyResult = await verifier.execute(context);
  const verifyOutput = verifyResult.output;

  // Authoritative decision re-evaluation
  const decision = chargebackDecisionService.evaluateChargebackDecision({
    evidenceIndex,
    verification: verifyOutput,
  });

  let responseStatus = 'DRAFT';
  if (verifyOutput.status === 'VERIFIED') {
    responseStatus = 'VERIFIED';
  } else if (verifyOutput.status === 'VERIFIED_WITH_WARNINGS') {
    responseStatus = 'VERIFIED_WITH_WARNINGS';
  } else if (verifyOutput.status === 'REJECTED') {
    responseStatus = 'REJECTED';
  }

  const updatedUnsupportedClaims = (verifyOutput.unsupportedClaims || []).map((c) => ({
    code: c.claimType || 'UNSUPPORTED_CLAIM',
    claim: c.text || '',
    severity:
      c.claimType === 'UNSUPPORTED_FRAUD_CLAIM' || c.claimType === 'UNSUPPORTED_OUTCOME_CLAIM'
        ? 'ERROR'
        : 'WARNING',
    message: c.reason || 'Verification violation',
  }));

  const verificationSubdoc = {
    status: verifyOutput.status,
    warnings: (verifyOutput.warnings || []).map((w) => ({
      code: 'VERIFICATION_WARNING',
      message: typeof w === 'string' ? w : w.message,
      severity: 'WARNING',
    })),
    scoreDelta: 0,
    isGroundingValid:
      verifyOutput.status === 'VERIFIED' || verifyOutput.status === 'VERIFIED_WITH_WARNINGS',
    verifiedAt: new Date(),
  };

  if (existingResponse) {
    existingResponse.verification = verificationSubdoc;
    existingResponse.unsupportedClaims = updatedUnsupportedClaims;
    existingResponse.recommendation = decision.recommendation;
    existingResponse.confidence = Math.round(decision.confidence * 100);
    existingResponse.status = responseStatus;
    if (overrideData.responseText) existingResponse.responseText = overrideData.responseText;
    if (overrideData.responseSummary) existingResponse.responseSummary = overrideData.responseSummary;
    await existingResponse.save();
  } else {
    existingResponse = await ChargebackResponse.create({
      merchantId,
      chargebackId,
      transactionId: chargeback.transactionId || transaction?._id,
      responseText: responseTextToVerify,
      responseSummary: summaryToVerify || 'Manually supplied rebuttal draft',
      keyArguments: keyArgumentsToVerify,
      evidenceReferences: Array.from(
        new Set(keyArgumentsToVerify.flatMap((a) => a.evidenceIds || a.evidenceItemIds || []))
      ),
      unsupportedClaims: updatedUnsupportedClaims,
      verification: verificationSubdoc,
      recommendation: decision.recommendation,
      confidence: Math.round(decision.confidence * 100),
      coverage: evidenceIndex,
      status: responseStatus,
    });
  }

  // Record AuditLog
  try {
    await AuditLog.create({
      entityType: 'ChargebackResponse',
      entityId: existingResponse._id,
      actorId: merchantId.toString(),
      actorType: 'MERCHANT',
      action: 'VERIFY_CHARGEBACK_RESPONSE',
      reason: `Verified chargeback response: status '${verifyOutput.status}', recommendation '${decision.recommendation}'`,
      newState: {
        status: responseStatus,
        recommendation: decision.recommendation,
        confidence: existingResponse.confidence,
      },
      timestamp: new Date(),
    });
  } catch (auditErr) {
    console.error('AuditLog creation failed:', auditErr.message);
  }

  return existingResponse;
}

module.exports = {
  generateResponse,
  getResponse,
  verifyResponse,
};
