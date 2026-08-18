"""Health check.

Expuesto en `/health` (infra: load balancers, Docker HEALTHCHECK) y también
versionado en `/api/v1/health` vía el router de la API.
"""

from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check() -> dict[str, str]:
    """Devuelve el estado del servicio: `{"status": "ok"}`."""
    return {"status": "ok"}
