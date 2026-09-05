"""Shared pytest fixtures for the AI Risk Service test suite."""

import pytest
from app.schemas import (
    BaselineInput,
    BaselineRuleMatch,
    BaselineSignal,
    CartItemInput,
    CustomerInput,
    PaymentMethodInput,
    RiskAnalysisRequest,
    TransactionInput,
)


@pytest.fixture
def sample_transaction() -> TransactionInput:
    return TransactionInput(
        id="64a1b2c3d4e5f6a7b8c9d001",
        externalTransactionId="TX-1001",
        amount=650.0,
        currency="USD",
        status="MANUAL_REVIEW",
        customer=CustomerInput(
            email="shopper@example.com",
            phone="+15551234567",
            customerId="CUST-42",
        ),
        paymentMethod=PaymentMethodInput(
            cardBin="411111",
            cardLast4="1111",
            cardType="VISA",
            issuerCountry="US",
        ),
        cartItems=[
            CartItemInput(
                title="Wireless Headset",
                price=650.0,
                quantity=1,
                category="Electronics",
            )
        ],
    )


@pytest.fixture
def sample_baseline() -> BaselineInput:
    return BaselineInput(
        riskScore=35,
        riskTier="MEDIUM",
        recommendation="REVIEW",
        signals=[
            BaselineSignal(
                code="ELEVATED_TRANSACTION_VALUE",
                description="Transaction amount ($650.00) falls within elevated threshold.",
                severity="MEDIUM",
                confidence=1.0,
            )
        ],
        ruleMatches=[
            BaselineRuleMatch(
                rule="ELEVATED_TRANSACTION_VALUE",
                points=20,
                reason="Amount is between $500.00 and $1000.00.",
            )
        ],
    )


@pytest.fixture
def sample_request(sample_transaction: TransactionInput, sample_baseline: BaselineInput) -> RiskAnalysisRequest:
    return RiskAnalysisRequest(
        transaction=sample_transaction,
        baseline=sample_baseline,
    )
