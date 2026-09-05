"""Tests for prompt rendering and negative constraints."""

from app.prompts.risk_analyst import build_user_prompt, get_system_prompt
from app.schemas import RiskAnalysisRequest


def test_system_prompt_contains_defensive_guidelines_and_negative_directives():
    """System prompt must enforce defensive analyst behavior and negative constraints."""
    system_prompt = get_system_prompt()

    # Core persona
    assert "defensive transaction risk analyst" in system_prompt.lower()

    # Prohibitions
    assert "claim certainty of fraud" in system_prompt
    assert "do not invent facts" in system_prompt.lower()
    assert "do not reveal internal chain-of-thought" in system_prompt.lower()

    # Output specification
    assert "aiScore" in system_prompt
    assert "riskTier" in system_prompt
    assert "recommendation" in system_prompt
    assert "riskFactors" in system_prompt


def test_user_prompt_formats_transaction_and_baseline(sample_request: RiskAnalysisRequest):
    """User prompt includes transaction amount, currency, and baseline signals."""
    tx_dict = sample_request.transaction.model_dump(exclude_none=True)
    baseline_dict = sample_request.baseline.model_dump(exclude_none=True)

    prompt = build_user_prompt(tx_dict, baseline_dict)

    assert "650" in prompt
    assert "USD" in prompt
    assert "ELEVATED_TRANSACTION_VALUE" in prompt
    assert "shopper@example.com" in prompt
