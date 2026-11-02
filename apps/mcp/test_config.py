"""Tests de `apps/mcp/config.py` (feature 019).

Cubren variables ausentes o inválidas, validación de URL/UUID, soporte opcional
de `GOOGLE_BOOKS_API_KEY` y que los mensajes de error no contienen secretos.
"""

from __future__ import annotations

from dataclasses import FrozenInstanceError
from uuid import UUID

import pytest

from config import MCPConfig, MCPConfigError, load_config

VALID_URL = "https://xyz.supabase.co"
VALID_KEY = "eyJhbGciOiJIUzI1NiJ9.service-role-key"
VALID_USER_ID = "00000000-0000-0000-0000-000000000001"


def _env(**overrides) -> dict[str, str]:
    base = {
        "SUPABASE_URL": VALID_URL,
        "SUPABASE_SERVICE_ROLE_KEY": VALID_KEY,
        "GEMINI_API_KEY": "AIza-secret-gemini-key",
        "MCP_USER_ID": VALID_USER_ID,
    }
    base.update(overrides)
    return base


def test_load_config_valida_y_tipa():
    config = load_config(_env())
    assert config.supabase_url == VALID_URL
    assert config.supabase_service_role_key == VALID_KEY
    assert config.gemini_api_key == "AIza-secret-gemini-key"
    assert config.mcp_user_id == UUID(VALID_USER_ID)
    assert config.google_books_api_key is None
    assert config.user_id == VALID_USER_ID


def test_google_books_opcional_se_lee_si_existe():
    config = load_config(_env(GOOGLE_BOOKS_API_KEY="books-key"))
    assert config.google_books_api_key == "books-key"


def test_google_books_vacio_se_trata_como_ausente():
    config = load_config(_env(GOOGLE_BOOKS_API_KEY="   "))
    assert config.google_books_api_key is None


@pytest.mark.parametrize(
    "variable",
    ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GEMINI_API_KEY", "MCP_USER_ID"],
)
def test_variable_obligatoria_ausente_nombra_la_variable(variable):
    env = _env()
    env[variable] = ""
    with pytest.raises(MCPConfigError) as exc_info:
        load_config(env)
    assert variable in str(exc_info.value)


def test_supabase_url_invalida():
    with pytest.raises(MCPConfigError) as exc_info:
        load_config(_env(SUPABASE_URL="not-a-url"))
    assert "SUPABASE_URL" in str(exc_info.value)


def test_mcp_user_id_invalido():
    with pytest.raises(MCPConfigError) as exc_info:
        load_config(_env(MCP_USER_ID="no-es-un-uuid"))
    assert "MCP_USER_ID" in str(exc_info.value)


def test_mensajes_no_contienen_secretos():
    """El mensaje de error nunca vuelca el valor del secreto (solo el nombre)."""
    secreto = "eyJ-super-secreto-service-role"
    with pytest.raises(MCPConfigError) as exc_info:
        load_config(_env(SUPABASE_SERVICE_ROLE_KEY=secreto, MCP_USER_ID="bad"))
    mensaje = str(exc_info.value)
    assert secreto not in mensaje
    assert "MCP_USER_ID" in mensaje
    # La clave Gemini tampoco aparece aunque sea inválida en otro campo.
    assert "AIza-secret-gemini-key" not in mensaje


def test_todos_los_errores_nombran_variables():
    """Con todas las variables ausentes, el primer error nombra una variable."""
    with pytest.raises(MCPConfigError) as exc_info:
        load_config({})
    message = str(exc_info.value)
    assert any(name in message for name in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"))


def test_config_es_inmutable():
    config = load_config(_env())
    assert isinstance(config, MCPConfig)
    # frozen dataclass: no se puede mutar accidentalmente.
    with pytest.raises(FrozenInstanceError):
        config.supabase_url = "https://otra.supabase.co"  # type: ignore[misc]
