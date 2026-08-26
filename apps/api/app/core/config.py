"""Configuración centralizada de Bookshelf API (feature 021).

Amplía la configuración existente a un modelo `Settings(BaseSettings)` completo
con enums, restricciones positivas, URLs tipadas y defaults explícitos para las
siete secciones del spec 021: entorno, Supabase/DB, IA, frontend/CORS, servicios
externos, logging/monitorización y seguridad.

Convenciones:
- Los campos `snake_case` mapean automáticamente las variables de entorno
  `UPPER_SNAKE_CASE` (case-insensitive, sin prefijo).
- `extra="ignore"` descarta variables desconocidas. En particular, cualquier
  intento de establecer `EMBEDDING_MODEL` o `EMBEDDING_DIMENSIONS` desde el
  entorno se ignora (no son campos), protegiendo la compatibilidad con
  `vector(768)` (límite duro: cambiar el modelo exige re-vectorización).
- Fail-fast: en producción las credenciales críticas son obligatorias y su
  ausencia aborta la construcción de `Settings` con un error que las nombra.
  En desarrollo/test se conservan defaults seguros para poder arrancar sin
  secretos reales (health checks, docs, tests).
- `Settings(_env_file=None, **overrides)` permite fixtures/tests aislados sin
  leer el `.env` real.
"""

from __future__ import annotations

from enum import Enum
from functools import lru_cache
from typing import ClassVar

from pydantic import Field, HttpUrl, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class AppEnv(str, Enum):
    """Entorno de ejecución de la aplicación."""

    development = "development"
    test = "test"
    production = "production"


class LogLevel(str, Enum):
    """Niveles de log permitidos."""

    DEBUG = "DEBUG"
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"


class LogFormat(str, Enum):
    """Formato de salida de los logs."""

    console = "console"
    json = "json"


# Credenciales críticas exigidas en producción (spec 021 §2.2/§7 + plan 021).
# `SUPABASE_JWKS_URL` se incluye por decisión del plan: aunque `security.py`
# dispone de un fallback derivado de `SUPABASE_URL`, en producción se exige
# explícito para proyectos con claves asimétricas (ES256).
_CRITICAL_CREDENTIALS: tuple[str, ...] = (
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_JWT_SECRET",
    "SUPABASE_JWKS_URL",
    "GEMINI_API_KEY",
)

# Origen de desarrollo por defecto (frontend Next.js local, puerto 3000). Nunca
# es un origen oficial de producción; se rechaza en ese entorno.
_DEV_CORS_DEFAULT = "http://localhost:3000"


class Settings(BaseSettings):
    """Settings tipadas de la aplicación (singleton + inyectable en FastAPI)."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
        env_ignore_empty=True,
    )

    # --- Constantes fijas (no configurables vía env) ------------------------
    # El modelo de embeddings no puede cambiarse sin re-vectorización explícita
    # de las notas existentes (límite duro de `tech-stack.md`).
    EMBEDDING_MODEL: ClassVar[str] = "text-embedding-004"
    EMBEDDING_DIMENSIONS: ClassVar[int] = 768

    # --- 1. Entorno ---------------------------------------------------------
    app_env: AppEnv = AppEnv.development
    debug: bool = False
    app_version: str = "0.1.0"
    api_host: str = "0.0.0.0"
    api_port: int = Field(default=8000, gt=0)

    # --- 2. Base de datos y Supabase ---------------------------------------
    supabase_url: HttpUrl | None = None
    supabase_service_role_key: str = ""
    supabase_jwt_secret: str = ""
    supabase_jwks_url: HttpUrl | None = None
    supabase_db_timeout_seconds: int = Field(default=30, gt=0)

    # --- 3. Inteligencia artificial ----------------------------------------
    gemini_api_key: str = ""
    gemini_chat_model: str = "gemini-3.5-flash"
    gemini_timeout_seconds: int = Field(default=60, gt=0)
    chat_stream_timeout_seconds: int = Field(default=60, gt=0)

    # --- 4. Frontend y CORS -------------------------------------------------
    cors_origins: list[str] = Field(default_factory=lambda: [_DEV_CORS_DEFAULT])
    next_public_site_url: HttpUrl | None = None
    api_url: HttpUrl | None = None
    next_public_supabase_url: HttpUrl | None = None
    next_public_supabase_anon_key: str = ""

    # --- 5. Servicios externos ---------------------------------------------
    google_books_api_key: str = ""
    open_library_timeout_seconds: int = Field(default=10, gt=0)
    isbn_cache_ttl_seconds: int = Field(default=3600, gt=0)
    isbn_rate_limit_per_minute: int = Field(default=100, gt=0)

    # --- 6. Logs y monitorización -------------------------------------------
    log_level: LogLevel = LogLevel.INFO
    log_format: LogFormat = LogFormat.json
    sentry_dsn: HttpUrl | None = None
    enable_request_logging: bool = False
    enable_metrics: bool = False

    # --- 7. Seguridad --------------------------------------------------------
    auth_required: bool = False
    access_token_expire_minutes: int = Field(default=60, gt=0)
    max_request_body_size_mb: int = Field(default=10, gt=0)
    rate_limit_enabled: bool = False
    rate_limit_requests_per_minute: int = Field(default=60, gt=0)
    trusted_proxy_ips: list[str] = Field(default_factory=list)

    # ------------------------------------------------------------------ hooks

    @field_validator("cors_origins", "trusted_proxy_ips", mode="before")
    @classmethod
    def _split_comma_separated(cls, value: object) -> object:
        """Convierte una lista separada por comas (`env`) en una lista Python."""
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @model_validator(mode="after")
    def _validate_production(self) -> Settings:
        """Fail-fast en producción: credenciales críticas + CORS oficial."""
        missing = self.missing_production_credentials()
        if missing:
            raise ValueError("Faltan credenciales críticas en producción: " + ", ".join(missing))
        self._validate_cors_origins()
        return self

    # ------------------------------------------------------------------ API

    def missing_production_credentials(self) -> list[str]:
        """Nombres de credenciales críticas ausentes (vacío fuera de producción)."""
        if self.app_env is not AppEnv.production:
            return []
        credentials: dict[str, str] = {
            "SUPABASE_URL": str(self.supabase_url) if self.supabase_url else "",
            "SUPABASE_SERVICE_ROLE_KEY": self.supabase_service_role_key,
            "SUPABASE_JWT_SECRET": self.supabase_jwt_secret,
            "SUPABASE_JWKS_URL": str(self.supabase_jwks_url) if self.supabase_jwks_url else "",
            "GEMINI_API_KEY": self.gemini_api_key,
        }
        return [name for name in _CRITICAL_CREDENTIALS if not credentials[name]]

    def validate_startup(self) -> None:
        """Validación de arranque explícita (llamada antes de los clientes externos).

        Defensiva: la construcción del singleton ya ejecuta el fail-fast vía
        `_validate_production`. Este método documenta la intención en `main.py`
        y permite revalidar de forma aislada en tests.
        """
        missing = self.missing_production_credentials()
        if missing:
            raise RuntimeError("Faltan credenciales críticas en producción: " + ", ".join(missing))

    def _validate_cors_origins(self) -> None:
        """Rechaza wildcard y orígenes no oficiales cuando `APP_ENV=production`."""
        if self.app_env is not AppEnv.production:
            return
        origins = self.cors_origins
        if "*" in origins:
            raise ValueError("CORS_ORIGINS no puede contener '*' en producción")
        if not origins:
            raise ValueError("CORS_ORIGINS debe definir al menos un origen en producción")
        if _DEV_CORS_DEFAULT in origins:
            raise ValueError(
                "CORS_ORIGINS no puede usar el origen de desarrollo "
                f"'{_DEV_CORS_DEFAULT}' en producción"
            )
        official = self._official_origins()
        invalid = [origin for origin in origins if origin not in official]
        if invalid:
            raise ValueError(
                "CORS_ORIGINS contiene orígenes no oficiales en producción: " + ", ".join(invalid)
            )

    def _official_origins(self) -> set[str]:
        """Allowlist oficial de producción derivada de `NEXT_PUBLIC_SITE_URL`."""
        if self.next_public_site_url is None:
            return set()
        return {_normalize_origin(str(self.next_public_site_url))}


def _normalize_origin(origin: str) -> str:
    """Normaliza un origen CORS para comparación (sin barra final)."""
    return origin.rstrip("/")


@lru_cache
def get_settings() -> Settings:
    """Singleton: las settings se resuelven una sola vez por proceso."""
    return Settings()


# Instancia a nivel de módulo para uso directo (`from app.core.config import settings`).
settings = get_settings()
