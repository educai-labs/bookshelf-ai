"""Bookshelf API — FastAPI app.

- `lifespan` (`asynccontextmanager`): configura logging, inicializa clientes
  Supabase/HTTP al arranque y los cierra al apagado.
- CORS restrictivo a `http://localhost:3000` (frontend Next.js en dev).
- Routers: `/health` (infra) + `/api/v1/*` (API versionada).
- Exception handlers globales con `detail` estructurado `{code, message, field?}`
  (convención de errores de `tech-stack.md`).
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.v1.endpoints import health
from app.api.v1.router import api_router
from app.core.config import settings
from app.core.database import close_db, init_db
from app.core.logging import configure_logging, get_logger

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
