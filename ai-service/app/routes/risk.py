"""API routes for transaction risk analysis."""

import logging
from fastapi import APIRouter, HTTPException, status
from app.schemas import RiskAnalysisRequest, RiskAnalysisResponse
from app.services.llm_client import (
    LLMConnectionError,
    LLMResponseError,
    LLMTimeoutError,
)
from app.services.risk_analyzer import (
    AIAnalysisValidationError,
    RiskAnalyzer,
    default_risk_analyzer,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/analyze", tags=["Risk Analysis"])


@router.post(
    "/risk",
    response_model=RiskAnalysisResponse,
    status_code=status.HTTP_200_OK,
    summary="Analyze transaction risk using defensive AI risk analyst",
)
async def analyze_transaction_risk(
    request: RiskAnalysisRequest,
) -> RiskAnalysisResponse:
    """
    Receives sanitized transaction metadata and deterministic baseline evidence.
    Invokes the OmniRoute LLM gateway, verifies strict JSON output, enforces
    score/tier/recommendation invariants, and returns the validated risk analysis.
    """
    analyzer: RiskAnalyzer = default_risk_analyzer

    try:
        result = await analyzer.analyze_risk(request)
        return result
    except AIAnalysisValidationError as e:
        logger.warning("AI analysis output validation failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "code": "AI_OUTPUT_VALIDATION_ERROR",
                "message": str(e),
            },
        ) from e
    except LLMTimeoutError as e:
        logger.error("OmniRoute LLM gateway request timed out: %s", e)
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail={
                "code": "LLM_GATEWAY_TIMEOUT",
                "message": "AI risk service request timed out communicating with LLM gateway.",
            },
        ) from e
    except LLMConnectionError as e:
        logger.error("Cannot connect to OmniRoute LLM gateway: %s", e)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "LLM_GATEWAY_UNAVAILABLE",
                "message": "OmniRoute LLM gateway is currently unreachable.",
            },
        ) from e
    except LLMResponseError as e:
        logger.error("OmniRoute LLM gateway returned an error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "code": "LLM_GATEWAY_ERROR",
                "message": f"LLM gateway returned an error: {e}",
            },
        ) from e
    except Exception as e:
        logger.exception("Unexpected error during AI risk analysis: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "INTERNAL_AI_ERROR",
                "message": "An internal error occurred while processing AI risk analysis.",
            },
        ) from e
