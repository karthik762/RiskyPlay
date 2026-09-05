"""FastAPI application entrypoint for RiskyPlay AI Service."""

import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.risk import router as risk_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

app = FastAPI(
    title="RiskyPlay AI Risk Service",
    description="Defensive AI transaction risk analysis microservice for RiskyPlay.",
    version="0.1.0",
)

# Enable CORS for internal microservice communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get(
    "/health",
    tags=["System"],
    summary="Health check endpoint",
)
async def health_check():
    """
    Returns service health status without calling the downstream LLM gateway.
    """
    return {
        "status": "ok",
        "service": "ai-service",
    }


# Mount API v1 routes
app.include_router(risk_router, prefix="/api/v1")
