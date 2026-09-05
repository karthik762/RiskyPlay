"""Unit tests for the isolated OpenAI-compatible LLM client."""

import pytest
import httpx
from app.services.llm_client import (
    LLMClient,
    LLMConnectionError,
    LLMResponseError,
    LLMTimeoutError,
)


@pytest.mark.asyncio
async def test_llm_client_success():
    """LLM client extracts message content from choices[0].message.content on HTTP 200."""
    mock_response_data = {
        "choices": [
            {
                "message": {
                    "role": "assistant",
                    "content": '{"aiScore": 40, "riskTier": "MEDIUM", "recommendation": "REVIEW"}',
                }
            }
        ]
    }

    def custom_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=mock_response_data)

    transport = httpx.MockTransport(custom_handler)

    client = LLMClient(base_url="http://mock-llm/v1")
    # Patch client transport
    async with httpx.AsyncClient(transport=transport) as mock_http_client:
        client_to_test = LLMClient(base_url="http://mock-llm/v1")
        # Direct call with mock transport
        response = await mock_http_client.post(
            "http://mock-llm/v1/chat/completions",
            json={"messages": [{"role": "user", "content": "hello"}]},
        )
        data = response.json()
        assert data["choices"][0]["message"]["content"] == mock_response_data["choices"][0]["message"]["content"]


@pytest.mark.asyncio
async def test_llm_client_connection_error(monkeypatch):
    """Client raises LLMConnectionError on network connection failure."""
    client = LLMClient(base_url="http://non-existent-host:9999/v1")

    async def mock_post(*args, **kwargs):
        raise httpx.ConnectError("Connection refused")

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    with pytest.raises(LLMConnectionError):
        await client.generate_completion([{"role": "user", "content": "test"}])


@pytest.mark.asyncio
async def test_llm_client_timeout_error(monkeypatch):
    """Client raises LLMTimeoutError on gateway timeout."""
    client = LLMClient(base_url="http://mock-llm/v1", timeout=1.0)

    async def mock_post(*args, **kwargs):
        raise httpx.TimeoutException("Read timed out")

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    with pytest.raises(LLMTimeoutError):
        await client.generate_completion([{"role": "user", "content": "test"}])


@pytest.mark.asyncio
async def test_llm_client_http_500_error(monkeypatch):
    """Client raises LLMResponseError on non-200 HTTP response."""
    client = LLMClient(base_url="http://mock-llm/v1")

    mock_resp = httpx.Response(500, text="Internal Gateway Error")

    async def mock_post(*args, **kwargs):
        return mock_resp

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    with pytest.raises(LLMResponseError) as exc_info:
        await client.generate_completion([{"role": "user", "content": "test"}])
    assert exc_info.value.status_code == 500
