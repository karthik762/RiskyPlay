"""Pydantic schemas for the AI Risk Analyst Service."""

from typing import List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


# ============================================================================
# REQUEST SCHEMAS (Node -> Python)
# ============================================================================

class CustomerInput(BaseModel):
    """Sanitized customer identity metadata."""
    email: Optional[str] = None
    phone: Optional[str] = None
    customerId: Optional[str] = None
    ipAddress: Optional[str] = None
    userAgent: Optional[str] = None


class PaymentMethodInput(BaseModel):
    """Masked payment instrument metadata (strictly no PAN, CVV, PIN)."""
    cardBin: Optional[str] = None
    cardLast4: Optional[str] = None
    cardType: Optional[str] = None
    issuerCountry: Optional[str] = None


class CartItemInput(BaseModel):
    """Item-level cart purchase details."""
    productId: Optional[str] = None
    title: str
    price: float = Field(ge=0, description="Unit price cannot be negative")
    quantity: int = Field(ge=1, description="Quantity must be at least 1")
    category: Optional[str] = None


class TransactionInput(BaseModel):
    """Normalized transaction payload sent for AI risk evaluation."""
    id: Optional[str] = None
    externalTransactionId: Optional[str] = None
    amount: float = Field(ge=0, description="Amount must be non-negative")
    currency: str = Field(default="USD", min_length=3, max_length=3)
    status: Optional[str] = None
    customer: Optional[CustomerInput] = None
    paymentMethod: Optional[PaymentMethodInput] = None
    cartItems: Optional[List[CartItemInput]] = None


class BaselineSignal(BaseModel):
    """Deterministic signal produced by Phase 2H baseline rules."""
    code: str
    description: str
    severity: Literal["LOW", "MEDIUM", "HIGH"]
    confidence: float = Field(ge=0, le=1.0)


class BaselineRuleMatch(BaseModel):
    """Deterministic rule match record with points."""
    rule: str
    points: int
    reason: str


class BaselineInput(BaseModel):
    """Deterministic risk analysis results provided as evidence."""
    riskScore: int = Field(ge=0, le=100)
    riskTier: Literal["LOW", "MEDIUM", "HIGH"]
    recommendation: Literal["APPROVE", "REVIEW", "DECLINE"]
    signals: List[BaselineSignal] = Field(default_factory=list)
    ruleMatches: List[BaselineRuleMatch] = Field(default_factory=list)


class RiskAnalysisRequest(BaseModel):
    """Top-level request payload accepted by POST /api/v1/analyze/risk."""
    transaction: TransactionInput
    baseline: BaselineInput


# ============================================================================
# RESPONSE SCHEMAS (Python -> Node)
# ============================================================================

class RiskFactor(BaseModel):
    """Structured AI risk observation."""
    model_config = ConfigDict(extra="forbid")

    code: str = Field(min_length=1, max_length=64, description="Machine-readable risk factor code")
    description: str = Field(min_length=1, description="Human-readable explanation of the risk factor")
    severity: Literal["LOW", "MEDIUM", "HIGH"]


class RiskAnalysisResponse(BaseModel):
    """Structured, validated risk assessment produced by the AI Risk Analyst."""
    model_config = ConfigDict(extra="forbid")

    aiScore: int = Field(ge=0, le=100, description="Integer AI risk score from 0 to 100")
    riskTier: Literal["LOW", "MEDIUM", "HIGH"]
    recommendation: Literal["APPROVE", "REVIEW", "DECLINE"]
    riskFactors: List[RiskFactor] = Field(default_factory=list)
    summary: str = Field(min_length=1, description="Concise rationale for the AI decision")

    @model_validator(mode="after")
    def verify_score_tier_recommendation_consistency(self) -> "RiskAnalysisResponse":
        """
        Enforces strict consistency across AI score, tier, and recommendation.
        Never trusts raw LLM outputs to adhere to tier boundaries without validation.
        """
        score = self.aiScore

        # Verify score to tier mapping
        if score <= 29:
            expected_tier = "LOW"
        elif score <= 69:
            expected_tier = "MEDIUM"
        else:
            expected_tier = "HIGH"

        if self.riskTier != expected_tier:
            raise ValueError(
                f"Inconsistent AI tier: aiScore {score} maps to '{expected_tier}', but received '{self.riskTier}'"
            )

        # Verify tier to recommendation mapping
        tier_to_rec = {
            "LOW": "APPROVE",
            "MEDIUM": "REVIEW",
            "HIGH": "DECLINE",
        }
        expected_rec = tier_to_rec[self.riskTier]
        if self.recommendation != expected_rec:
            raise ValueError(
                f"Inconsistent AI recommendation: riskTier '{self.riskTier}' maps to '{expected_rec}', but received '{self.recommendation}'"
            )

        return self


# ============================================================================
# CHARGEBACK DEFENSIVE RESPONSE SCHEMAS
# ============================================================================

class ChargebackEvidenceItem(BaseModel):
    """Sanitized evidence item metadata passed to the chargeback responder."""
    id: str
    evidenceType: str
    title: Optional[str] = None
    extractedFacts: Optional[dict] = None
    summary: Optional[str] = None


class ChargebackInput(BaseModel):
    """Sanitized dispute metadata for chargeback rebuttal generation."""
    id: str
    disputeAmount: float = Field(ge=0, description="Dispute amount must be non-negative")
    currency: str = Field(default="USD", min_length=3, max_length=3)
    reasonCode: Optional[str] = None
    reasonCategory: Optional[str] = None
    stage: Optional[str] = None
    network: Optional[str] = None


class ChargebackResponseRequest(BaseModel):
    """Request payload for POST /api/v1/chargebacks/response/generate."""
    chargeback: ChargebackInput
    transaction: Optional[TransactionInput] = None
    evidenceItems: List[ChargebackEvidenceItem] = Field(default_factory=list)
    evidenceCompletenessScore: Optional[float] = None
    missingCriticalTypes: Optional[List[str]] = Field(default_factory=list)


class KeyArgument(BaseModel):
    """Individual evidence-grounded claim supporting defense."""
    model_config = ConfigDict(extra="forbid")

    claim: str = Field(min_length=1, description="Specific factual statement")
    evidenceItemIds: List[str] = Field(default_factory=list, description="IDs of evidence items that support this claim")
    groundingExplanation: str = Field(min_length=1, description="Brief explanation of how evidence supports claim")


class ChargebackResponseOutput(BaseModel):
    """Defensive response draft generated by the AI chargeback specialist."""
    model_config = ConfigDict(extra="forbid")

    responseText: str = Field(min_length=10, description="Full formal rebuttal draft")
    keyArguments: List[KeyArgument] = Field(default_factory=list)
    suggestedRecommendation: Literal[
        "DEFEND",
        "DEFEND_WITH_REVIEW",
        "INSUFFICIENT_EVIDENCE",
        "DO_NOT_RECOMMEND_DEFENSE",
    ]
    confidence: float = Field(ge=0.0, le=1.0)
    summary: str = Field(min_length=1, description="Concise defense overview")

