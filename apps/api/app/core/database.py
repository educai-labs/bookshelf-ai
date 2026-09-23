"""Cliente de datos: Supabase (service_role).

Singleton por proceso:
- `_supabase`: cliente Supabase `service_role` (bypass RLS para operaciones de
  sistema: vectorización, admin). Solo backend (límite duro).

El lifespan de `main.py` llama `init_db()`/`close_db()`. Los endpoints inyectan
el cliente vía `Depends(get_supabase)`.
"""

from fastapi import HTTPException
from supabase import Client, create_client

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_supabase: Client | None = None


async def init_db() -> None:
    """Inicializa el cliente al arranque de la aplicación (lifespan)."""
    global _supabase

    if _supabase is None:
        if settings.supabase_url and settings.supabase_service_role_key:
            _supabase = create_client(
                str(settings.supabase_url), settings.supabase_service_role_key
            )
            logger.info("supabase_client_initialized", url=str(settings.supabase_url))
        else:
            logger.warning(
                "supabase_client_skipped",
                reason="SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no configurados",
            )


async def close_db() -> None:
    """Cierra el cliente al apagado de la aplicación (lifespan)."""
    global _supabase

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


def get_supabase_client() -> Client | None:
    """Cliente `service_role` (singleton) para tareas de sistema, sin `raise`.

    A diferencia de `get_supabase` (dependency HTTP que lanza 503), devuelve
    `None` si el cliente no está inicializado, para que las tareas background
    (vectorización, feature 016) registren un error estructurado en lugar de
    lanzar una `HTTPException` fuera de un contexto de request.
    """
    return _supabase
