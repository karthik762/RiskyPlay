"""Tests for Pydantic request and response schemas, including consistency validators."""

import pytest
from pydantic import ValidationError

from app.schemas import (
    CustomerInput,
    PaymentMethodInput,
    RiskAnalysisRequest,
    RiskAnalysisResponse,
    RiskFactor,
    TransactionInput,
)


def test_valid_risk_analysis_response():
    """Valid consistent response passes validation."""
    response = RiskAnalysisResponse(
        aiScore=45,
        riskTier="MEDIUM",
        recommendation="REVIEW",
        riskFactors=[
            RiskFactor(code="ELEVATED_VALUE", description="Amount is above average", severity="MEDIUM")
        ],
        summary="Transaction requires review due to elevated amount.",
    )
    assert response.aiScore == 45
    assert response.riskTier == "MEDIUM"
    assert response.recommendation == "REVIEW"


def test_response_rejects_out_of_bounds_score():
    """Score < 0 or > 100 must be rejected."""
    with pytest.raises(ValidationError):
        RiskAnalysisResponse(
            aiScore=-1,
            riskTier="LOW",
            recommendation="APPROVE",
            summary="Invalid negative score",
        )

    with pytest.raises(ValidationError):
        RiskAnalysisResponse(
            aiScore=101,
            riskTier="HIGH",
            recommendation="DECLINE",
            summary="Invalid score above 100",
        )


def test_response_rejects_inconsistent_score_to_tier():
    """Score 20 with HIGH tier or score 85 with LOW tier must be rejected."""
    with pytest.raises(ValidationError, match="Inconsistent AI tier"):
        RiskAnalysisResponse(
            aiScore=20,
            riskTier="HIGH",
            recommendation="DECLINE",
            summary="Inconsistent",
        )

    with pytest.raises(ValidationError, match="Inconsistent AI tier"):
        RiskAnalysisResponse(
            aiScore=85,
            riskTier="LOW",
            recommendation="APPROVE",
            summary="Inconsistent",
        )


def test_response_rejects_inconsistent_tier_to_recommendation():
    """LOW tier with DECLINE recommendation must be rejected."""
    with pytest.raises(ValidationError, match="Inconsistent AI recommendation"):
        RiskAnalysisResponse(
            aiScore=15,
            riskTier="LOW",
            recommendation="DECLINE",
            summary="Inconsistent recommendation",
        )

    with pytest.raises(ValidationError, match="Inconsistent AI recommendation"):
        RiskAnalysisResponse(
            aiScore=75,
            riskTier="HIGH",
            recommendation="APPROVE",
            summary="Inconsistent recommendation",
        )


def test_transaction_input_rejects_negative_amount():
    """Transaction amount cannot be negative."""
    with pytest.raises(ValidationError):
        TransactionInput(amount=-50.0, currency="USD")


def test_payment_method_input_contains_only_masked_metadata():
    """PaymentMethodInput validates only cardBin, cardLast4, cardType, issuerCountry."""
    pm = PaymentMethodInput(cardBin="411111", cardLast4="1111", cardType="VISA", issuerCountry="US")
    assert pm.cardBin == "411111"
    assert pm.cardLast4 == "1111"


def test_response_rejects_extra_forbidden_fields():
    """RiskAnalysisResponse must strictly reject unexpected extra fields (e.g. scratchpad, chainOfThought)."""
    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        RiskAnalysisResponse(
            aiScore=25,
            riskTier="LOW",
            recommendation="APPROVE",
            summary="Valid summary",
            scratchpad="Internal reasoning here",
        )

    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        RiskAnalysisResponse(
            aiScore=25,
            riskTier="LOW",
            recommendation="APPROVE",
            summary="Valid summary",
            chainOfThought="Step 1: check amount...",
        )

    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        RiskAnalysisResponse(
            aiScore=25,
            riskTier="LOW",
            recommendation="APPROVE",
            summary="Valid summary",
            reasoning="Hidden reasoning",
        )


def test_risk_factor_rejects_extra_forbidden_fields():
    """RiskFactor must strictly reject unexpected extra fields."""
    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        RiskFactor(
            code="TEST_CODE",
            description="Test description",
            severity="LOW",
            speculativeField="unauthorized",
        )

