"""OpenAI-compatible HTTP client for interacting with OmniRoute LLM gateway."""

import logging
from typing import Any, Dict, List, Optional
import httpx

from app.config import settings

logger = logging.getLogger(__name__)


class LLMClientError(Exception):
    """Base exception for LLM communication errors."""
    pass


class LLMConnectionError(LLMClientError):
    """Raised when the client cannot connect to the OmniRoute gateway."""
    pass


class LLMTimeoutError(LLMClientError):
    """Raised when an LLM request exceeds the configured timeout."""
    pass


class LLMResponseError(LLMClientError):
    """Raised when the LLM gateway returns an error response or invalid payload."""
    def __init__(self, message: str, status_code: Optional[int] = None):
        super().__init__(message)
        self.status_code = status_code


class LLMClient:
    """Async client interfacing with an OpenAI-compatible LLM endpoint."""

    def __init__(
        self,
        base_url: Optional[str] = None,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        timeout: Optional[float] = None,
    ):
        self.base_url = (base_url or settings.OMNIROUTE_BASE_URL).rstrip("/")
        self.api_key = api_key if api_key is not None else settings.OMNIROUTE_API_KEY
        self.model = model or settings.OMNIROUTE_MODEL
        self.timeout = timeout or settings.OMNIROUTE_TIMEOUT_SECONDS

    async def generate_completion(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.1,
        response_format: Optional[Dict[str, str]] = None,
    ) -> str:
        """
        Calls the /chat/completions endpoint on the OpenAI-compatible gateway.

        Returns raw response text from choices[0].message.content.
        """
        url = f"{self.base_url}/chat/completions"
        headers: Dict[str, str] = {
            "Content-Type": "application/json",
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        payload: Dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
        }
        if response_format:
            payload["response_format"] = response_format

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(url, headers=headers, json=payload)

                if response.status_code != 200:
                    logger.warning(
                        "LLM gateway returned non-200 status %d: %s",
                        response.status_code,
                        response.text,
                    )
                    raise LLMResponseError(
                        f"LLM gateway error ({response.status_code}): {response.text}",
                        status_code=response.status_code,
                    )

                data = response.json()
                choices = data.get("choices")
                if not choices or not isinstance(choices, list) or len(choices) == 0:
                    raise LLMResponseError("LLM response did not contain valid choices")

                content = choices[0].get("message", {}).get("content")
                if content is None:
                    raise LLMResponseError("LLM choice message content is missing")

                return str(content)

        except httpx.ConnectError as e:
            logger.error("Failed to connect to OmniRoute gateway at %s: %s", url, e)
            raise LLMConnectionError(f"Cannot connect to OmniRoute gateway at {url}: {e}") from e
        except httpx.TimeoutException as e:
            logger.error("Request to OmniRoute gateway timed out after %.1fs", self.timeout)
            raise LLMTimeoutError(f"OmniRoute gateway request timed out after {self.timeout}s") from e
        except httpx.HTTPError as e:
            logger.error("HTTP error communicating with OmniRoute gateway: %s", e)
            raise LLMClientError(f"HTTP error communicating with LLM gateway: {e}") from e


default_llm_client = LLMClient()
