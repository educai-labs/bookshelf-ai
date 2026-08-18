"""Configuración centralizada de Bookshelf API.

Carga las variables de entorno desde `.env` (Pydantic-Settings v2).
Es el único source of truth para secrets y settings (límite duro: no hardcodear
URLs ni claves; siempre vía `settings`).

Convención de nombres: el campo `supabase_url` mapea automáticamente la variable
de entorno `SUPABASE_URL` (case-insensitive, sin prefijo).
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Settings de la aplicación.

    Los 5 campos requeridos por la feature 006. Los secrets tienen default vacío
    para permitir arranque local sin credenciales (health check / docs / tests);
    las features 007+ añadirán validación estricta cuando haya credenciales.
    """

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- Supabase ---
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    supabase_jwt_secret: str = ""

    # --- Google Gemini ---
    gemini_api_key: str = ""

    # --- Logging: INFO (JSON prod) | DEBUG (pretty console dev) ---
    log_level: str = "INFO"


@lru_cache
def get_settings() -> Settings:
    """Singleton: las settings se resuelven una sola vez por proceso."""
    return Settings()


# Instancia a nivel de módulo para uso directo (`from app.core.config import settings`).
settings = get_settings()
