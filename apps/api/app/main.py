"""Bookshelf API — FastAPI app.

- `lifespan` (`asynccontextmanager`): configura logging, inicializa clientes
  Supabase/HTTP al arranque y los cierra al apagado.
- CORS restrictivo a `http://localhost:3000` (frontend Next.js en dev).
- Routers: `/health` (infra) + `/api/v1/*` (API versionada).
- Exception handlers globales con `detail` estructurado `{code, message, field?}`
  (convención de errores de `tech-stack.md`).
- OpenAPI: registra los schemas de la feature 007 (`app/schemas/`) aunque aún
  no haya endpoints que los referencien (features 008-010); cuando los usen,
  FastAPI los añade solo y el registro queda como no-op.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from fastapi.responses import JSONResponse
from pydantic import TypeAdapter
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.v1.endpoints import health
from app.api.v1.router import api_router
from app.core.config import settings
from app.core.database import close_db, init_db
from app.core.logging import configure_logging, get_logger
from app.schemas import (
    BookCreate,
    BookMetadata,
    BookRead,
    BookStatus,
    BookUpdate,
    ChatRequest,
    ChatResponse,
    NoteCreate,
    NoteRead,
    RecommendationItem,
    RecommendationResponse,
)

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Ciclo de vida: logging + clientes al arranque, cierre al apagado."""
    configure_logging(settings.log_level)
    logger.info("api_starting", app=app.title, version=app.version)
    await init_db()
    yield
    await close_db()
    logger.info("api_stopped")


app = FastAPI(
    title="Bookshelf API",
    description="Backend FastAPI de Bookshelf: bibliotecas personales inteligentes.",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS: solo el frontend de desarrollo Next.js (puerto 3000), con credentials
# para cookies/JWT. En producción se ampliará vía variable de entorno.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health check de infraestructura en la raíz + API versionada.
app.include_router(health.router)
app.include_router(api_router)


# ---------------------------------------------------------------------------
# OpenAPI: registro de los schemas de la feature 007
# ---------------------------------------------------------------------------

_FEATURE_007_MODELS = (
    BookStatus,
    BookMetadata,
    BookCreate,
    BookRead,
    BookUpdate,
    NoteCreate,
    NoteRead,
    ChatRequest,
    ChatResponse,
    RecommendationItem,
    RecommendationResponse,
)


def _model_json_schema(model) -> dict:
    """JSON Schema de un modelo de `app/schemas` (enum o `BaseModel`).

    Usa el mismo `ref_template` que FastAPI para que las referencias cruzadas
    (p. ej. `BookUpdate.status` → `BookStatus`, `RecommendationResponse` →
    `RecommendationItem`) apunten a `components.schemas` en lugar de `$defs`.
    """
    getter = getattr(model, "model_json_schema", None)
    if getter is not None:
        return getter(ref_template="#/components/schemas/{model}")
    return TypeAdapter(model).json_schema()


def custom_openapi() -> dict:
    """OpenAPI estándar + schemas de feature 007 (modelos sin endpoint aún)."""
    if app.openapi_schema:
        return app.openapi_schema
    openapi_schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
    )
    schemas = openapi_schema.setdefault("components", {}).setdefault("schemas", {})
    for model in _FEATURE_007_MODELS:
        schemas.setdefault(model.__name__, _model_json_schema(model))
    app.openapi_schema = openapi_schema
    return openapi_schema


app.openapi = custom_openapi


# ---------------------------------------------------------------------------
# Exception handlers globales
# ---------------------------------------------------------------------------


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    """HTTPException → `detail` estructurado `{code, message, field?}`."""
    detail = exc.detail
    if isinstance(detail, str):
        detail = {"code": "HTTP_ERROR", "message": detail}
    return JSONResponse(status_code=exc.status_code, content={"detail": detail})


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Errores de validación Pydantic → 422 con detalle estructurado."""
    errors = exc.errors()
    # Pydantic puede incluir excepciones en `ctx` (p. ej. `ValueError` lanzado
    # por validators); se convierten a string para que el JSON sea serializable.
    for error in errors:
        ctx = error.get("ctx")
        if isinstance(ctx, dict):
            error["ctx"] = {key: str(value) for key, value in ctx.items()}
    field = errors[0]["loc"][-1] if errors else None
    return JSONResponse(
        status_code=422,
        content={
            "detail": {
                "code": "VALIDATION_ERROR",
                "message": "Invalid request",
                "field": field,
                "errors": errors,
            }
        },
    )
