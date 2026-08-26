"""Tests de redacción de logs (feature 021).

Verifican que el processor `redact_sensitive` elimina secretos (API keys, JWTs,
cookies, service role keys) y contenido privado (notas, prompts) — incluidos
valores anidados — antes de los renderers, tanto en formato consola como JSON.
"""

import io
import logging

import structlog

from app.core.logging import REDACTED, configure_logging, redact_sensitive

# Valores sensibles representativos (longitud real de una Google API key).
_API_KEY = "AIzaSyD4iE2xVh9zY3K1mN0pQrStUvWxYzAbCdE"
_JWT = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJzdWIiOiIxMjM0NTY3ODkwIiwicm9sZSI6ImF1dGhlbnRpY2F0ZWQifQ."
    "dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"
)
_NOTE_CONTENT = "Nota privada completa del usuario: mi contraseña de caja fuerte."
_PROMPT = "¿Cuáles son mis notas sobre la contraseña del banco?"


# ---------------------------------------------------------------------------
# Processor (unitario)
# ---------------------------------------------------------------------------


def test_redact_sensitive_por_nombre():
    """Campos sensibles por nombre se redactan por completo."""
    out = redact_sensitive(
        None,
        "info",
        {
            "event": "login",
            "api_key": _API_KEY,
            "service_role_key": "secret",
            "authorization": f"Bearer {_JWT}",
            "cookie": "session=abc123",
            "note_content": _NOTE_CONTENT,
            "prompt": _PROMPT,
            "user_id": "u1",
        },
    )
    assert out["api_key"] == REDACTED
    assert out["service_role_key"] == REDACTED
    assert out["authorization"] == REDACTED
    assert out["cookie"] == REDACTED
    assert out["note_content"] == REDACTED
    assert out["prompt"] == REDACTED
    assert out["user_id"] == "u1"  # campo no sensible conservado


def test_redact_sensitive_valores_anidados():
    """Se redactan secretos dentro de dicts y listas anidados."""
    out = redact_sensitive(
        None,
        "info",
        {
            "event": "request",
            "context": {"headers": {"authorization": f"Bearer {_JWT}"}},
            "items": [{"api_key": _API_KEY}, "texto normal"],
        },
    )
    assert out["context"]["headers"]["authorization"] == REDACTED
    assert out["items"][0]["api_key"] == REDACTED
    assert out["items"][1] == "texto normal"


def test_redact_sensitive_por_patron_independiente_del_nombre():
    """JWT/API key se redactan por patrón aunque el campo no sea sensible."""
    out = redact_sensitive(
        None,
        "error",
        {"event": f"fallo de conexión token={_JWT}", "message": f"key {_API_KEY} falló"},
    )
    assert _JWT not in out["event"]
    assert REDACTED in out["event"]
    assert _API_KEY not in out["message"]
    assert REDACTED in out["message"]


def test_redact_sensitive_conserva_campos_no_sensibles():
    """Los campos útiles no sensibles se conservan intactos."""
    out = redact_sensitive(
        None,
        "info",
        {"event": "nota guardada", "note_id": "abc", "duration_ms": 42, "chunks": 3},
    )
    assert out["note_id"] == "abc"
    assert out["duration_ms"] == 42
    assert out["chunks"] == 3


# ---------------------------------------------------------------------------
# Salida renderizada (consola y JSON)
# ---------------------------------------------------------------------------


def _capture_output(log_format: str) -> io.StringIO:
    """Configura logging con el formato dado y captura el stdout del root logger."""
    configure_logging("DEBUG", log_format)
    buffer = io.StringIO()
    logging.getLogger().handlers = [logging.StreamHandler(buffer)]
    return buffer


def test_formato_json_redacta_secretos():
    """El JSON renderizado no contiene secretos; sí el marcador de redacción."""
    buffer = _capture_output("json")
    logger = structlog.get_logger("test_json_redact")
    logger.info(
        "login",
        api_key=_API_KEY,
        authorization=f"Bearer {_JWT}",
        cookie="session=abc",
        service_role_key="sr",
        note_content=_NOTE_CONTENT,
        prompt=_PROMPT,
        user_id="u1",
    )
    output = buffer.getvalue()
    for secret in (_API_KEY, _JWT, "session=abc", "sr", _NOTE_CONTENT, _PROMPT):
        assert secret not in output
    assert REDACTED in output
    assert "u1" in output  # campo no sensible conservado


def test_formato_consola_redacta_secretos():
    """La consola renderizada no contiene secretos; sí el marcador."""
    buffer = _capture_output("console")
    logger = structlog.get_logger("test_console_redact")
    logger.info(
        "login",
        api_key=_API_KEY,
        authorization=f"Bearer {_JWT}",
        cookie="session=abc",
        note_content=_NOTE_CONTENT,
        user_id="u1",
    )
    output = buffer.getvalue()
    for secret in (_API_KEY, _JWT, "session=abc", _NOTE_CONTENT):
        assert secret not in output
    assert REDACTED in output
    assert "u1" in output


def test_formato_json_redacta_secretos_anidados():
    """Valores anidados quedan redactados también en el JSON renderizado."""
    buffer = _capture_output("json")
    logger = structlog.get_logger("test_json_nested_redact")
    logger.info("request", context={"headers": {"authorization": f"Bearer {_JWT}"}})
    output = buffer.getvalue()
    assert _JWT not in output
    assert REDACTED in output
