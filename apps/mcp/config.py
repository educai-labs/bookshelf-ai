"""Configuración y validación de arranque del servidor MCP (feature 019).

Lee y valida las variables de entorno **antes** de registrar ninguna tool:

- Obligatorias: `SUPABASE_URL` (URL http(s)), `SUPABASE_SERVICE_ROLE_KEY`
  (JWT no vacío), `GEMINI_API_KEY` (no vacía) y `MCP_USER_ID` (UUID).
- Opcional: `GOOGLE_BOOKS_API_KEY` (fallback del lookup ISBN).

Si falta o es inválida, `load_config` lanza `MCPConfigError` con un mensaje que
nombra la variable y qué se espera de ella, **sin volcar nunca el valor**
(secretos fuera de logs y errores). El servidor termina con ese mensaje.
"""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass
from urllib.parse import urlparse
from uuid import UUID


class MCPConfigError(Exception):
    """Configuración ausente o inválida (nombra la variable, sin el valor)."""

    def __init__(self, variable: str, reason: str) -> None:
        self.variable = variable
        self.reason = reason
        super().__init__(f"{variable}: {reason}")


@dataclass(frozen=True)
class MCPConfig:
    """Configuración validada del servidor MCP (inmutable)."""

    supabase_url: str
    supabase_service_role_key: str
    gemini_api_key: str
    mcp_user_id: UUID
    google_books_api_key: str | None = None

    @property
    def user_id(self) -> str:
        """`MCP_USER_ID` como string (filtro de ownership en todas las tools)."""
        return str(self.mcp_user_id)


def _require(name: str, value: str | None) -> str:
    if value is None or not value.strip():
        raise MCPConfigError(name, "es obligatoria y no puede estar vacía")
    return value.strip()


def _validate_url(name: str, value: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise MCPConfigError(
            name,
            "debe ser una URL http(s) válida (p. ej. https://<project-ref>.supabase.co)",
        )
    return value


def _validate_uuid(name: str, value: str) -> UUID:
    try:
        return UUID(value)
    except (ValueError, TypeError, AttributeError):
        raise MCPConfigError(
            name,
            "debe ser un UUID válido (formato 8-4-4-4-12)",
        ) from None


def load_config(environ: Mapping[str, str] | None = None) -> MCPConfig:
    """Lee y valida la configuración desde el entorno.

    `environ` permite inyectar un mapping en tests (por defecto `os.environ`).
    """
    env: Mapping[str, str] = os.environ if environ is None else environ

    supabase_url = _validate_url("SUPABASE_URL", _require("SUPABASE_URL", env.get("SUPABASE_URL")))
    service_role = _require("SUPABASE_SERVICE_ROLE_KEY", env.get("SUPABASE_SERVICE_ROLE_KEY"))
    gemini_key = _require("GEMINI_API_KEY", env.get("GEMINI_API_KEY"))
    user_id = _validate_uuid("MCP_USER_ID", _require("MCP_USER_ID", env.get("MCP_USER_ID")))

    google_books = env.get("GOOGLE_BOOKS_API_KEY")
    google_books_key = (google_books.strip() or None) if google_books else None

    return MCPConfig(
        supabase_url=supabase_url,
        supabase_service_role_key=service_role,
        gemini_api_key=gemini_key,
        mcp_user_id=user_id,
        google_books_api_key=google_books_key,
    )
