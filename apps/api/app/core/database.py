"""Clientes de datos: Supabase (service_role) y HTTP async.

Singleton por proceso:
- `_supabase`: cliente Supabase `service_role` (bypass RLS para operaciones de
  sistema: vectorización, admin). Solo backend (límite duro).
- `_http_client`: `httpx.AsyncClient` para llamadas HTTP externas
  (Open Library, Google Books, Gemini) con pooling y timeouts.

El lifespan de `main.py` llama `init_db()`/`close_db()`. Los endpoints inyectan
los clientes vía `Depends(get_supabase)` / `Depends(get_http_client)`.
"""

from typing import Any

from fastapi import HTTPException
from supabase import Client, create_client

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_supabase: Client | None = None
_http_client: Any = None  # httpx.AsyncClient | None


async def init_db() -> None:
    """Inicializa los clientes al arranque de la aplicación (lifespan)."""
    global _supabase, _http_client

    if _http_client is None:
        import httpx

        _http_client = httpx.AsyncClient(timeout=30.0, follow_redirects=True)
        logger.info("http_client_initialized")

    if _supabase is None:
        if settings.supabase_url and settings.supabase_service_role_key:
            _supabase = create_client(settings.supabase_url, settings.supabase_service_role_key)
            logger.info("supabase_client_initialized", url=settings.supabase_url)
        else:
            logger.warning(
                "supabase_client_skipped",
                reason="SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no configurados",
            )


async def close_db() -> None:
    """Cierra los clientes al apagado de la aplicación (lifespan)."""
    global _supabase, _http_client

    if _http_client is not None:
        await _http_client.aclose()
        _http_client = None
        logger.info("http_client_closed")

    _supabase = None
    logger.info("supabase_client_closed")


def get_supabase() -> Client:
    """Dependency: cliente Supabase `service_role` (singleton)."""
    if _supabase is None:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "DB_NOT_INITIALIZED",
                "message": "Supabase client no inicializado (¿faltan credenciales en .env?)",
            },
        )
    return _supabase


async def get_http_client() -> Any:
    """Dependency: `httpx.AsyncClient` compartido (singleton)."""
    if _http_client is None:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "HTTP_CLIENT_NOT_INITIALIZED",
                "message": "HTTP client no inicializado",
            },
        )
    return _http_client
