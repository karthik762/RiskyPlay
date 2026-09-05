"""Unit tests for RiskAnalyzer execution, JSON extraction, and consistency enforcement."""

import pytest
from app.schemas import RiskAnalysisRequest
from app.services.llm_client import LLMClient
from app.services.risk_analyzer import (
    AIAnalysisValidationError,
    RiskAnalyzer,
    extract_json_payload,
)


def test_extract_json_payload_clean_json():
    """Extracts JSON from standard JSON string."""
    raw = '{"aiScore": 25, "riskTier": "LOW", "recommendation": "APPROVE"}'
    data = extract_json_payload(raw)
    assert data["aiScore"] == 25
    assert data["riskTier"] == "LOW"


def test_extract_json_payload_markdown_code_fences():
    """Extracts JSON enclosed in markdown code fences."""
    raw = """Here is the assessment:
```json
{
  "aiScore": 85,
  "riskTier": "HIGH",
  "recommendation": "DECLINE",
  "summary": "High risk detected"
}
```
"""
    data = extract_json_payload(raw)
    assert data["aiScore"] == 85
    assert data["riskTier"] == "HIGH"


def test_extract_json_payload_invalid_json():
    """Raises AIAnalysisValidationError when JSON syntax is corrupted."""
    with pytest.raises(AIAnalysisValidationError):
        extract_json_payload("This is not JSON at all.")


@pytest.mark.asyncio
async def test_risk_analyzer_valid_flow(sample_request: RiskAnalysisRequest):
    """RiskAnalyzer parses and validates complete LLM JSON response."""
    valid_llm_json = """{
      "aiScore": 55,
      "riskTier": "MEDIUM",
      "recommendation": "REVIEW",
      "riskFactors": [
        {
          "code": "ELEVATED_VALUE",
          "description": "Transaction value is higher than normal benchmark.",
          "severity": "MEDIUM"
        }
      ],
      "summary": "Elevated transaction amount requires secondary verification."
    }"""

    class MockLLMClient:
        async def generate_completion(self, *args, **kwargs):
            return valid_llm_json

    analyzer = RiskAnalyzer(llm_client=MockLLMClient())
    result = await analyzer.analyze_risk(sample_request)

    assert result.aiScore == 55
    assert result.riskTier == "MEDIUM"
    assert result.recommendation == "REVIEW"
    assert len(result.riskFactors) == 1
    assert result.riskFactors[0].code == "ELEVATED_VALUE"


@pytest.mark.asyncio
async def test_risk_analyzer_rejects_inconsistent_llm_output(sample_request: RiskAnalysisRequest):
    """RiskAnalyzer rejects LLM response where score contradicts risk tier."""
    inconsistent_llm_json = """{
      "aiScore": 85,
      "riskTier": "LOW",
      "recommendation": "APPROVE",
      "summary": "This should fail validation"
    }"""

    class MockLLMClient:
        async def generate_completion(self, *args, **kwargs):
            return inconsistent_llm_json

    analyzer = RiskAnalyzer(llm_client=MockLLMClient())
    with pytest.raises(AIAnalysisValidationError, match="Inconsistent AI tier"):
        await analyzer.analyze_risk(sample_request)
