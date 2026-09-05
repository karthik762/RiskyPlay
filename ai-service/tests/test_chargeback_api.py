"""FastAPI integration tests for /api/v1/chargebacks/response/generate."""

import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.routes import chargeback as chargeback_module
from app.services.chargeback_responder import ChargebackResponder
from app.services.llm_client import LLMConnectionError, LLMTimeoutError

client = TestClient(app)


@pytest.fixture
def sample_chargeback_request():
    return {
        "chargeback": {
            "id": "cb_1234567890abcdef12345678",
            "disputeAmount": 150.00,
            "currency": "USD",
            "reasonCode": "10.4",
            "reasonCategory": "FRAUD",
            "stage": "FIRST_CHARGEBACK",
            "network": "VISA",
        },
        "transaction": {
            "id": "tx_1234567890abcdef12345678",
            "amount": 150.00,
            "currency": "USD",
            "customer": {
                "email": "c***@example.com",
            },
        },
        "evidenceItems": [
            {
                "id": "ev_0123456789abcdef01234567",
                "evidenceType": "PROOF_OF_DELIVERY",
                "title": "FedEx Delivery Confirmation",
                "extractedFacts": {
                    "trackingNumber": "123456789012",
                    "deliveryDate": "2026-08-20T14:30:00Z",
                    "signedBy": "J. Doe",
                },
            }
        ],
        "evidenceCompletenessScore": 85.0,
        "missingCriticalTypes": [],
    }


def test_generate_chargeback_response_success(sample_chargeback_request, monkeypatch):
    """POST /api/v1/chargebacks/response/generate returns 200 with validated draft."""
    valid_llm_output = """{
      "responseText": "This is a formal rebuttal for dispute cb_1234567890abcdef12345678 concerning transaction tx_1234567890abcdef12345678 in the amount of $150.00. The merchandise was delivered with proof of delivery.",
      "keyArguments": [
        {
          "claim": "Delivery confirmed to the cardholder billing address on 2026-08-20",
          "evidenceItemIds": ["ev_0123456789abcdef01234567"],
          "groundingExplanation": "FedEx signed delivery confirmation indicates successful receipt."
        }
      ],
      "suggestedRecommendation": "DEFEND",
      "confidence": 0.92,
      "summary": "Compelling proof of delivery refuting unrecognized charge claim."
    }"""

    class MockLLM:
        async def generate_completion(self, *args, **kwargs):
            return valid_llm_output

    monkeypatch.setattr(
        chargeback_module,
        "default_chargeback_responder",
        ChargebackResponder(llm_client=MockLLM()),
    )

    response = client.post(
        "/api/v1/chargebacks/response/generate",
        json=sample_chargeback_request,
    )
    assert response.status_code == 200
    data = response.json()
    assert "rebuttal" in data["responseText"]
    assert len(data["keyArguments"]) == 1
    assert data["keyArguments"][0]["evidenceItemIds"] == ["ev_0123456789abcdef01234567"]
    assert data["suggestedRecommendation"] == "DEFEND"
    assert data["confidence"] == 0.92


def test_generate_chargeback_response_validation_failure(sample_chargeback_request, monkeypatch):
    """Returns 502 when LLM returns invalid JSON or schema violations."""
    invalid_llm_output = '{"responseText": "Short", "unexpectedField": "bad"}'

    class MockLLM:
        async def generate_completion(self, *args, **kwargs):
            return invalid_llm_output

    monkeypatch.setattr(
        chargeback_module,
        "default_chargeback_responder",
        ChargebackResponder(llm_client=MockLLM()),
    )

    response = client.post(
        "/api/v1/chargebacks/response/generate",
        json=sample_chargeback_request,
    )
    assert response.status_code == 502
    data = response.json()
    assert data["detail"]["code"] == "AI_OUTPUT_VALIDATION_ERROR"


def test_generate_chargeback_response_gateway_timeout(sample_chargeback_request, monkeypatch):
    """Returns 504 when OmniRoute times out."""
    class TimingOutLLM:
        async def generate_completion(self, *args, **kwargs):
            raise LLMTimeoutError("Request timed out")

    monkeypatch.setattr(
        chargeback_module,
        "default_chargeback_responder",
        ChargebackResponder(llm_client=TimingOutLLM()),
    )

    response = client.post(
        "/api/v1/chargebacks/response/generate",
        json=sample_chargeback_request,
    )
    assert response.status_code == 504
    data = response.json()
    assert data["detail"]["code"] == "LLM_GATEWAY_TIMEOUT"
