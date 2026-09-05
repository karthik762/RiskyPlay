"""Risk Analyzer service orchestrating prompt construction, LLM execution, and validation."""

import json
import logging
import re
from typing import Any, Dict, Optional
from pydantic import ValidationError

from app.prompts.risk_analyst import build_user_prompt, get_system_prompt
from app.schemas import RiskAnalysisRequest, RiskAnalysisResponse
from app.services.llm_client import LLMClient, default_llm_client

logger = logging.getLogger(__name__)


class AIAnalysisError(Exception):
    """Base exception for AI analysis failures."""
    pass


class AIAnalysisValidationError(AIAnalysisError):
    """Raised when LLM output cannot be parsed or fails schema/consistency validation."""
    pass


def extract_json_payload(raw_text: str) -> Dict[str, Any]:
    """
    Extracts a JSON object from raw model output, handling potential markdown fences.
    """
    cleaned = raw_text.strip()

    # Handle ```json ... ``` or ``` ... ``` code fences
    fence_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", cleaned, re.IGNORECASE)
    if fence_match:
        cleaned = fence_match.group(1).strip()

    try:
        data = json.loads(cleaned)
        if not isinstance(data, dict):
            raise AIAnalysisValidationError(f"Expected JSON object, but parsed {type(data).__name__}")
        return data
    except json.JSONDecodeError as e:
        logger.warning("Failed to decode JSON from LLM output: %s (Raw: %s)", e, raw_text[:200])
        raise AIAnalysisValidationError(f"Invalid JSON in model output: {e}") from e


class RiskAnalyzer:
    """Orchestrates AI-assisted risk analysis for a transaction and baseline evidence."""

    def __init__(self, llm_client: Optional[LLMClient] = None):
        self.llm_client = llm_client or default_llm_client

    async def analyze_risk(self, request: RiskAnalysisRequest) -> RiskAnalysisResponse:
        """
        Executes AI risk analysis:
        1. Formats transaction and deterministic baseline into prompt.
        2. Calls OmniRoute LLM gateway.
        3. Parses structured JSON response.
        4. Validates schema and consistency rules (score-tier-recommendation).
        5. Returns validated RiskAnalysisResponse.
        """
        transaction_dict = request.transaction.model_dump(exclude_none=True)
        baseline_dict = request.baseline.model_dump(exclude_none=True)

        messages = [
            {"role": "system", "content": get_system_prompt()},
            {"role": "user", "content": build_user_prompt(transaction_dict, baseline_dict)},
        ]

        # Call OmniRoute client
        raw_output = await self.llm_client.generate_completion(
            messages=messages,
            temperature=0.1,
            response_format={"type": "json_object"},
        )

        # Parse JSON
        parsed_dict = extract_json_payload(raw_output)

        # Validate with Pydantic (which automatically validates consistency via model_validator)
        try:
            validated_response = RiskAnalysisResponse.model_validate(parsed_dict)
            return validated_response
        except ValidationError as e:
            logger.warning("Pydantic validation failed for LLM risk analysis: %s", e)
            error_messages = [f"{err['loc']}: {err['msg']}" for err in e.errors()]
            raise AIAnalysisValidationError(f"Model output failed validation: {'; '.join(error_messages)}") from e


default_risk_analyzer = RiskAnalyzer()
