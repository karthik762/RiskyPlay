"""FastAPI integration tests for /health and /api/v1/analyze/risk."""

import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.routes import risk as risk_module
from app.services.llm_client import LLMConnectionError, LLMTimeoutError
from app.services.risk_analyzer import AIAnalysisValidationError, RiskAnalyzer

client = TestClient(app)


def test_health_check_endpoint():
    """GET /health returns 200 OK without requiring downstream LLM calls."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "ai-service",
    }


def test_analyze_risk_endpoint_success(sample_request, monkeypatch):
    """POST /api/v1/analyze/risk returns 200 with validated AI response."""
    valid_llm_output = """{
      "aiScore": 62,
      "riskTier": "MEDIUM",
      "recommendation": "REVIEW",
      "riskFactors": [
        {
          "code": "ELEVATED_VALUE",
          "description": "Transaction amount is materially above normal baseline threshold.",
          "severity": "MEDIUM"
        }
      ],
      "summary": "The transaction presents moderate merchant-loss risk and should receive manual review."
    }"""

    class MockLLM:
        async def generate_completion(self, *args, **kwargs):
            return valid_llm_output

    monkeypatch.setattr(risk_module, "default_risk_analyzer", RiskAnalyzer(llm_client=MockLLM()))

    response = client.post("/api/v1/analyze/risk", json=sample_request.model_dump())
    assert response.status_code == 200
    data = response.json()
    assert data["aiScore"] == 62
    assert data["riskTier"] == "MEDIUM"
    assert data["recommendation"] == "REVIEW"
    assert len(data["riskFactors"]) == 1
    assert data["riskFactors"][0]["code"] == "ELEVATED_VALUE"


def test_analyze_risk_endpoint_gateway_unavailable(sample_request, monkeypatch):
    """Returns 503 when OmniRoute gateway is unreachable."""
    class FailingLLM:
        async def generate_completion(self, *args, **kwargs):
            raise LLMConnectionError("Connection refused")

    monkeypatch.setattr(risk_module, "default_risk_analyzer", RiskAnalyzer(llm_client=FailingLLM()))

    response = client.post("/api/v1/analyze/risk", json=sample_request.model_dump())
    assert response.status_code == 503
    data = response.json()
    assert data["detail"]["code"] == "LLM_GATEWAY_UNAVAILABLE"


def test_analyze_risk_endpoint_gateway_timeout(sample_request, monkeypatch):
    """Returns 504 when OmniRoute gateway request times out."""
    class TimeoutLLM:
        async def generate_completion(self, *args, **kwargs):
            raise LLMTimeoutError("Timed out")

    monkeypatch.setattr(risk_module, "default_risk_analyzer", RiskAnalyzer(llm_client=TimeoutLLM()))

    response = client.post("/api/v1/analyze/risk", json=sample_request.model_dump())
    assert response.status_code == 504
    data = response.json()
    assert data["detail"]["code"] == "LLM_GATEWAY_TIMEOUT"


def test_analyze_risk_endpoint_bad_gateway_on_validation_failure(sample_request, monkeypatch):
    """Returns 502 when LLM outputs unparseable or contradictory data."""
    class BadOutputLLM:
        async def generate_completion(self, *args, **kwargs):
            return "This is not JSON"

    monkeypatch.setattr(risk_module, "default_risk_analyzer", RiskAnalyzer(llm_client=BadOutputLLM()))

    response = client.post("/api/v1/analyze/risk", json=sample_request.model_dump())
    assert response.status_code == 502
    data = response.json()
    assert data["detail"]["code"] == "AI_OUTPUT_VALIDATION_ERROR"
