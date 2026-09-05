/**
 * AgentContext — Immutable, tenant-scoped context container provided to each executing agent.
 * Strictly forbids JWTs, passwords, PAN, CVV, or sensitive merchant credentials.
 * Deeply freezes and defensively copies data to prevent unauthorized runtime mutation.
 */

function deepCloneAndFreeze(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  const clone = Array.isArray(obj) ? [] : {};
  for (const key of Object.keys(obj)) {
    clone[key] = deepCloneAndFreeze(obj[key]);
  }
  return Object.freeze(clone);
}

/**
 * Sanitizes transaction object to ensure strictly no sensitive cardholder or credential data.
 */
function sanitizeTransactionForContext(transaction) {
  if (!transaction) return {};
  const doc = typeof transaction.toObject === 'function' ? transaction.toObject() : transaction;

  return {
    id: (doc._id || doc.id)?.toString(),
    _id: (doc._id || doc.id)?.toString(),
    externalTransactionId: doc.externalTransactionId,
    amount: doc.amount,
    currency: doc.currency || 'USD',
    status: doc.status,
    timestamp: doc.timestamp,
    customer: doc.customer
      ? {
          email: doc.customer.email,
          customerId: doc.customer.customerId,
          phone: doc.customer.phone,
          billingAddress: doc.customer.billingAddress,
          shippingAddress: doc.customer.shippingAddress,
        }
      : undefined,
    paymentMethod: doc.paymentMethod
      ? {
          cardBin: doc.paymentMethod.cardBin,
          cardLast4: doc.paymentMethod.cardLast4,
          cardType: doc.paymentMethod.cardType,
          issuerCountry: doc.paymentMethod.issuerCountry,
        }
      : undefined,
    cartItems: Array.isArray(doc.cartItems)
      ? doc.cartItems.map((item) => ({
          productId: item.productId,
          title: item.title,
          price: item.price,
          quantity: item.quantity,
          category: item.category,
        }))
      : [],
  };
}

/**
 * Sanitizes chargeback object to ensure clean serialization and no Mongoose document cycles.
 */
function sanitizeChargebackForContext(chargeback) {
  if (!chargeback) return null;
  const doc = typeof chargeback.toObject === 'function' ? chargeback.toObject() : chargeback;
  return {
    id: (doc._id || doc.id)?.toString(),
    _id: (doc._id || doc.id)?.toString(),
    caseNumber: doc.caseNumber,
    disputeAmount: doc.disputeAmount,
    currency: doc.currency || 'USD',
    reasonCode: doc.reasonCode,
    reasonCategory: doc.reasonCategory,
    reasonDescription: doc.reasonDescription,
    stage: doc.stage,
    network: doc.network,
    status: doc.status,
    deadlineDate: doc.deadlineDate,
    disputeDate: doc.disputeDate,
    transactionId: doc.transactionId?.toString(),
    merchantId: doc.merchantId?.toString(),
  };
}

/**
 * Sanitizes evidence index to ensure clean serialization and no Mongoose document cycles.
 */
function sanitizeEvidenceIndexForContext(evidenceIndex) {
  if (!evidenceIndex) return null;
  const doc = typeof evidenceIndex.toObject === 'function' ? evidenceIndex.toObject() : evidenceIndex;
  const rawItems = Array.isArray(doc.items) ? doc.items : Array.isArray(doc) ? doc : [];
  return {
    completenessScore: doc.completenessScore,
    missingCriticalTypes: Array.isArray(doc.missingCriticalTypes) ? [...doc.missingCriticalTypes] : [],
    missingRecommendedTypes: Array.isArray(doc.missingRecommendedTypes) ? [...doc.missingRecommendedTypes] : [],
    items: rawItems.map((item) => {
      const iDoc = typeof item?.toObject === 'function' ? item.toObject() : item;
      return {
        id: (iDoc._id || iDoc.id)?.toString(),
        _id: (iDoc._id || iDoc.id)?.toString(),
        evidenceType: iDoc.evidenceType || iDoc.type || 'OTHER',
        type: iDoc.type || iDoc.evidenceType || 'OTHER',
        title: iDoc.title,
        extractedFacts: iDoc.extractedFacts,
        summary: iDoc.summary,
      };
    }),
  };
}

class AgentContext {
  /**
   * @param {Object} params
   * @param {string} params.runId - Unique execution run identifier
   * @param {string} params.merchantId - Authenticated merchant identifier (strictly verified)
   * @param {string} params.transactionId - Subject transaction identifier
   * @param {Object} params.transaction - Tenant-scoped transaction metadata
   * @param {Object} [params.deterministicAssessment] - Pre-calculated baseline risk evaluation
   * @param {Object} [params.previousAgentResults] - Dictionary of completed agent outputs
   * @param {Object} [params.metadata] - Additional execution context
   */
  constructor({
    runId,
    merchantId,
    transactionId,
    transaction,
    chargebackId = null,
    chargeback = null,
    evidenceIndex = null,
    entityType = null,
    deterministicAssessment = null,
    previousAgentResults = {},
    metadata = {},
  }) {
    if (!runId || typeof runId !== 'string') {
      throw new TypeError('AgentContext requires a non-empty string runId');
    }
    if (!merchantId || typeof merchantId !== 'string') {
      throw new TypeError('AgentContext requires an authenticated string merchantId');
    }
    const resolvedTxId = transactionId || (chargeback?.transactionId ? chargeback.transactionId.toString() : null);
    if (!resolvedTxId && !chargebackId) {
      throw new TypeError('AgentContext requires a non-empty string transactionId');
    }

    this.runId = runId;
    this.merchantId = merchantId;
    this.transactionId = resolvedTxId || null;
    this.transaction = deepCloneAndFreeze(sanitizeTransactionForContext(transaction));
    this.deterministicAssessment = deterministicAssessment ? deepCloneAndFreeze(deterministicAssessment) : null;
    this.chargebackId = chargebackId || null;
    this.chargeback = chargeback ? deepCloneAndFreeze(sanitizeChargebackForContext(chargeback)) : null;
    this.evidenceIndex = evidenceIndex ? deepCloneAndFreeze(sanitizeEvidenceIndexForContext(evidenceIndex)) : null;
    this.entityType = entityType || (chargebackId ? 'CHARGEBACK_REBUTTAL' : 'TRANSACTION_RISK');
    this._previousAgentResults = deepCloneAndFreeze(previousAgentResults);
    this.metadata = deepCloneAndFreeze(metadata);

    Object.freeze(this);
  }

  /**
   * Safely retrieves the output of a previously executed agent.
   *
   * @param {string} agentName - Name of the prior agent
   * @returns {Object|null} Output produced by the agent, or null if not found
   */
  getResult(agentName) {
    if (!agentName || typeof agentName !== 'string') return null;
    return this._previousAgentResults[agentName] || null;
  }

  /**
   * Checks whether a prior agent executed and produced a result.
   *
   * @param {string} agentName - Name of the agent to check
   * @returns {boolean} True if previous result exists
   */
  hasResult(agentName) {
    return Boolean(this._previousAgentResults[agentName]);
  }

  /**
   * Returns an immutable copy of all previous agent results.
   *
   * @returns {Object}
   */
  getAllResults() {
    return { ...this._previousAgentResults };
  }

  /**
   * Creates a new AgentContext instance containing an additional agent result.
   * Ensures context immutability across multi-agent execution steps.
   *
   * @param {import('./AgentResult')} agentResult - Completed agent result
   * @returns {AgentContext} New evolved context
   */
  withAgentResult(agentResult) {
    if (!agentResult || !agentResult.agentName) {
      throw new TypeError('Cannot evolve context without a valid AgentResult');
    }

    const updatedResults = {
      ...this._previousAgentResults,
      [agentResult.agentName]: agentResult.output,
    };

    return new AgentContext({
      runId: this.runId,
      merchantId: this.merchantId,
      transactionId: this.transactionId,
      transaction: this.transaction,
      chargebackId: this.chargebackId,
      chargeback: this.chargeback,
      evidenceIndex: this.evidenceIndex,
      entityType: this.entityType,
      deterministicAssessment: this.deterministicAssessment,
      previousAgentResults: updatedResults,
      metadata: this.metadata,
    });
  }
}

module.exports = AgentContext;
