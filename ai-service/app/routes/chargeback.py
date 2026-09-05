"""API routes for defensive chargeback response generation."""

import logging
from fastapi import APIRouter, HTTPException, status
from app.schemas import ChargebackResponseOutput, ChargebackResponseRequest
from app.services.chargeback_responder import (
    ChargebackResponder,
    ChargebackResponseValidationError,
    default_chargeback_responder,
)
from app.services.llm_client import (
    LLMConnectionError,
    LLMResponseError,
    LLMTimeoutError,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chargebacks", tags=["Chargeback Response"])


@router.post(
    "/response/generate",
    response_model=ChargebackResponseOutput,
    status_code=status.HTTP_200_OK,
    summary="Generate defensive chargeback response draft using AI",
)
async def generate_chargeback_response(
    request: ChargebackResponseRequest,
) -> ChargebackResponseOutput:
    """
    Receives dispute metadata, transaction details, and indexed evidence items.
    Invokes the OmniRoute LLM gateway, verifies strict JSON output, enforces
    evidence grounding constraints, and returns the validated defensive rebuttal draft.
    """
    responder: ChargebackResponder = default_chargeback_responder

    try:
        result = await responder.generate_response(request)
        return result
    except ChargebackResponseValidationError as e:
        logger.warning("Chargeback response output validation failed: %s", e)
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
                "message": "Chargeback response request timed out communicating with LLM gateway.",
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
        logger.exception("Unexpected error during chargeback response generation: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "INTERNAL_AI_ERROR",
                "message": "An internal error occurred while generating chargeback response.",
            },
        ) from e
