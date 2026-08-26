"""Tests del modelo de configuración `Settings` (feature 021).

Cubren carga válida con overrides, coerción, defaults, enums, URLs tipadas,
límites positivos, errores `ValidationError` con campo y razón, constantes de
embeddings, aislamiento de `.env` y fail-fast de producción.
"""

import pytest
from pydantic import ValidationError

from app.core.config import AppEnv, LogFormat, LogLevel, Settings


def _field_names(error: ValidationError) -> set[str]:
    """Nombres de campos referenciados en un `ValidationError`."""
    fields = set()
    for err in error.errors():
        loc = err.get("loc") or ()
        for item in loc:
            if isinstance(item, str):
                fields.add(item)
    return fields


def _messages(error: ValidationError) -> str:
    """Mensajes de error concatenados (para comprobar razones)."""
    return " ".join(err.get("msg", "") for err in error.errors())


# ---------------------------------------------------------------------------
# Carga válida, overrides y coerción
# ---------------------------------------------------------------------------


def test_settings_acepta_overrides_y_coerciona_tipos():
    """Overrides por constructor cargan y coercionan str→int/enum/list."""
    s = Settings(
        _env_file=None,
        app_env="test",
        api_port="9000",
        gemini_timeout_seconds="30",
        cors_origins="http://localhost:3000, https://app.example.com",
        trusted_proxy_ips="10.0.0.1, 10.0.0.2",
    )
    assert s.app_env is AppEnv.test
    assert s.api_port == 9000
    assert isinstance(s.api_port, int)
    assert s.gemini_timeout_seconds == 30
    assert s.cors_origins == ["http://localhost:3000", "https://app.example.com"]
    assert s.trusted_proxy_ips == ["10.0.0.1", "10.0.0.2"]


def test_settings_defaults_explicitos():
    """Defaults explícitos documentados en el spec."""
    s = Settings(_env_file=None)
    assert s.app_env is AppEnv.development
    assert s.debug is False
    assert s.app_version == "0.1.0"
    assert s.api_host == "0.0.0.0"
    assert s.api_port == 8000
    assert s.gemini_chat_model == "gemini-3.5-flash"
    assert s.chat_stream_timeout_seconds == 60
    assert s.log_level is LogLevel.INFO
    assert s.log_format is LogFormat.json
    assert s.auth_required is False
    assert s.rate_limit_enabled is False
    assert s.enable_request_logging is False
    assert s.enable_metrics is False


def test_enums_aceptan_valores_validos():
    """APP_ENV/LOG_LEVEL/LOG_FORMAT son enums con valores permitidos."""
    assert Settings(_env_file=None, app_env="development").app_env is AppEnv.development
    assert Settings(_env_file=None, app_env="test").app_env is AppEnv.test
    # `production` se valida aparte (exige credenciales): ver fail-fast.
    assert Settings(_env_file=None, log_level="DEBUG").log_level is LogLevel.DEBUG
    assert Settings(_env_file=None, log_level="WARNING").log_level is LogLevel.WARNING
    assert Settings(_env_file=None, log_format="console").log_format is LogFormat.console
    assert Settings(_env_file=None, log_format="json").log_format is LogFormat.json


def test_urls_tipadas_como_httpurl():
    """Las URLs se parsean como `HttpUrl` y se pueden usar como string."""
    s = Settings(_env_file=None, supabase_url="https://abc.supabase.co")
    assert s.supabase_url is not None
    assert str(s.supabase_url).startswith("https://abc.supabase.co")
    # ausencia permitida fuera de producción
    assert Settings(_env_file=None).supabase_url is None


# ---------------------------------------------------------------------------
# Valores inválidos → ValidationError con campo y razón
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("kwargs", "expected_field"),
    [
        ({"app_env": "staging"}, "app_env"),
        ({"api_port": "not-an-int"}, "api_port"),
        ({"api_port": 0}, "api_port"),
        ({"gemini_timeout_seconds": -1}, "gemini_timeout_seconds"),
        ({"chat_stream_timeout_seconds": 0}, "chat_stream_timeout_seconds"),
        ({"supabase_db_timeout_seconds": -5}, "supabase_db_timeout_seconds"),
        ({"isbn_rate_limit_per_minute": 0}, "isbn_rate_limit_per_minute"),
        ({"open_library_timeout_seconds": -1}, "open_library_timeout_seconds"),
        ({"supabase_url": "not-a-url"}, "supabase_url"),
        ({"log_level": "TRACE"}, "log_level"),
        ({"log_format": "xml"}, "log_format"),
    ],
)
def test_valores_invalidos_lanzan_validation_error_con_campo(kwargs, expected_field):
    """Criterio: valores inválidos → `ValidationError` con campo identificado."""
    with pytest.raises(ValidationError) as exc_info:
        Settings(_env_file=None, **kwargs)
    assert expected_field in _field_names(exc_info.value)
    assert _messages(exc_info.value)  # razón no vacía


def test_error_invalido_identifica_campo_y_razon():
    """El error incluye el campo y la razón del fallo (p. ej. `greater_than`)."""
    with pytest.raises(ValidationError) as exc_info:
        Settings(_env_file=None, api_port=0)
    error = exc_info.value.errors()[0]
    assert error["loc"][-1] == "api_port"
    assert error["type"] == "greater_than"


# ---------------------------------------------------------------------------
# Constantes de embeddings
# ---------------------------------------------------------------------------


def test_embedding_constants_fijas():
    """EMBEDDING_MODEL/DIMENSIONS son constantes de clase con valores fijos."""
    assert Settings.EMBEDDING_MODEL == "text-embedding-004"
    assert Settings.EMBEDDING_DIMENSIONS == 768


def test_embedding_constants_no_configurables_por_env():
    """Intentar fijarlas vía env/constructor se ignora (`extra="ignore"`)."""
    s = Settings(_env_file=None, EMBEDDING_MODEL="other-model", EMBEDDING_DIMENSIONS="128")
    assert Settings.EMBEDDING_MODEL == "text-embedding-004"
    assert Settings.EMBEDDING_DIMENSIONS == 768
    # No son campos de instancia: no existen en el modelo.
    assert not hasattr(s, "embedding_model")
    assert not hasattr(s, "embedding_dimensions")


# ---------------------------------------------------------------------------
# Aislamiento de `.env`
# ---------------------------------------------------------------------------


def test_settings_aisladas_de_env_file():
    """`_env_file=None` evita leer el `.env` real (tests sin secretos)."""
    s = Settings(_env_file=None)
    assert s.supabase_url is None
    assert s.supabase_service_role_key == ""
    assert s.gemini_api_key == ""


def test_settings_env_file_none_no_afecta_singleton():
    """Las instancias con `_env_file=None` no alteran el `.env` ni el singleton."""
    from app.core.config import settings

    before = settings.gemini_chat_model
    isolated = Settings(_env_file=None, gemini_chat_model="gemini-9.9")
    assert isolated.gemini_chat_model == "gemini-9.9"
    assert settings.gemini_chat_model == before


# ---------------------------------------------------------------------------
# Fail-fast en producción
# ---------------------------------------------------------------------------

_PRODUCTION_CREDS = {
    "supabase_url": "https://abc.supabase.co",
    "supabase_service_role_key": "service-role-key",
    "supabase_jwt_secret": "jwt-secret",
    "supabase_jwks_url": "https://abc.supabase.co/auth/v1/.well-known/jwks.json",
    "gemini_api_key": "gemini-key",
    "next_public_site_url": "https://app.bookshelf.com",
    "cors_origins": "https://app.bookshelf.com",
}


def test_production_reporta_todas_las_credenciales_faltantes():
    """Con APP_ENV=production y sin credenciales, el error nombra todas."""
    with pytest.raises(ValidationError) as exc_info:
        Settings(_env_file=None, app_env="production")
    message = str(exc_info.value)
    for name in (
        "SUPABASE_URL",
        "SUPABASE_SERVICE_ROLE_KEY",
        "SUPABASE_JWT_SECRET",
        "SUPABASE_JWKS_URL",
        "GEMINI_API_KEY",
    ):
        assert name in message


def test_production_arranca_con_configuracion_completa():
    """Una configuración de producción completa se construye sin error."""
    s = Settings(_env_file=None, app_env="production", **_PRODUCTION_CREDS)
    assert s.missing_production_credentials() == []


def test_development_no_exige_credenciales():
    """En desarrollo/test no se exigen secretos (health checks sin `.env`)."""
    assert Settings(_env_file=None).missing_production_credentials() == []
    assert Settings(_env_file=None, app_env="test").missing_production_credentials() == []


def test_production_reporte_de_una_sola_credencial_faltante():
    """Falta una sola credencial → el error la nombra (y no a las presentes)."""
    creds = dict(_PRODUCTION_CREDS)
    del creds["gemini_api_key"]
    with pytest.raises(ValidationError) as exc_info:
        Settings(_env_file=None, app_env="production", **creds)
    message = str(exc_info.value)
    assert "GEMINI_API_KEY" in message
    assert "SUPABASE_URL" not in message


# ---------------------------------------------------------------------------
# CORS por entorno
# ---------------------------------------------------------------------------


def test_cors_desarrollo_permite_multiples_origenes():
    """Desarrollo acepta una lista separada por comas sin restricciones."""
    s = Settings(_env_file=None, cors_origins="http://localhost:3000,http://localhost:3001")
    assert s.cors_origins == ["http://localhost:3000", "http://localhost:3001"]


def test_cors_produccion_acepta_origen_oficial():
    """Producción acepta solo el origen oficial (`NEXT_PUBLIC_SITE_URL`)."""
    s = Settings(_env_file=None, app_env="production", **_PRODUCTION_CREDS)
    assert s.cors_origins == ["https://app.bookshelf.com"]


def test_cors_produccion_rechaza_wildcard():
    """Producción rechaza `*`."""
    creds = dict(_PRODUCTION_CREDS, cors_origins="*")
    with pytest.raises(ValidationError) as exc_info:
        Settings(_env_file=None, app_env="production", **creds)
    assert "CORS_ORIGINS" in str(exc_info.value)


def test_cors_produccion_rechaza_origen_no_oficial():
    """Producción rechaza orígenes fuera de la allowlist oficial."""
    creds = dict(_PRODUCTION_CREDS, cors_origins="https://evil.example.com")
    with pytest.raises(ValidationError) as exc_info:
        Settings(_env_file=None, app_env="production", **creds)
    assert "evil.example.com" in str(exc_info.value)


def test_cors_produccion_rechaza_origen_de_desarrollo():
    """Producción rechaza el origen de desarrollo localhost:3000."""
    creds = dict(_PRODUCTION_CREDS, cors_origins="http://localhost:3000")
    with pytest.raises(ValidationError) as exc_info:
        Settings(_env_file=None, app_env="production", **creds)
    assert "localhost" in str(exc_info.value)
