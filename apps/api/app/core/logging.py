"""Logging estructurado con structlog (feature 021).

- `LOG_FORMAT=json` (por defecto): `JSONRenderer` → logs parseables en
  agregadores (Datadog, Loki, CloudWatch).
- `LOG_FORMAT=console`: `ConsoleRenderer` → pretty console legible.

Antes de cualquiera de los renderers se inserta el processor `redact_sensitive`,
que redacta secretos (API keys, JWTs, cookies, service role keys) y contenido
privado (notas y prompts) tanto por nombre de campo como por patrón, de forma
que la redacción no dependa de que el llamador use un nombre concreto.
"""

import logging
import re

import structlog

_configured = False

# Marcador usado en la salida al redactar un valor sensible.
REDACTED = "[REDACTED]"

# --- Patrones de secretos por valor ----------------------------------------
# JWT compacto: tres segmentos base64url separados por puntos (los JWT de
# Supabase, incluida la `service_role` key, empiezan por `eyJ`).
_JWT_RE = re.compile(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b")
# API key de Google (Google/Gemini/Books): prefijo `AIza` + 35 alfanuméricos.
_GOOGLE_API_KEY_RE = re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b")

# --- Marcadores de nombres de campo sensibles ------------------------------
_SENSITIVE_KEY_MARKERS = (
    "api_key",
    "apikey",
    "_key",
    "secret",
    "password",
    "token",
    "jwt",
    "cookie",
    "session",
    "service_role",
    "authorization",
    "credential",
)

# Contenido privado: notas y prompts del usuario.
_PRIVATE_CONTENT_MARKERS = ("note", "prompt", "content")


def _is_sensitive_key(name: str) -> bool:
    """True si el nombre del campo sugiere un secreto (clave, token, cookie…)."""
    normalized = name.lower()
    return any(marker in normalized for marker in _SENSITIVE_KEY_MARKERS)


def _is_private_content_key(name: str) -> bool:
    """True si el nombre del campo sugiere contenido privado (nota/prompt).

    Se excluyen los identificadores (`*_id`/`*_ids`, p. ej. `note_id`), que son
    metadatos no sensibles, frente al contenido completo de notas/prompts.
    """
    normalized = name.lower()
    if normalized.endswith(("_id", "_ids")):
        return False
    return any(marker in normalized for marker in _PRIVATE_CONTENT_MARKERS)


def _redact_value(value: object) -> object:
    """Redacta patrones (JWT/API key) dentro de un valor escalar o anidado."""
    if isinstance(value, str):
        value = _JWT_RE.sub(REDACTED, value)
        value = _GOOGLE_API_KEY_RE.sub(REDACTED, value)
        return value
    if isinstance(value, dict):
        return {key: _redact(key, item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_redact_value(item) for item in value]
    return value


def _redact(key: object, value: object) -> object:
    """Redacta un campo por nombre y, recursivamente, por patrón de valor."""
    if isinstance(key, str) and (_is_sensitive_key(key) or _is_private_content_key(key)):
        return REDACTED
    return _redact_value(value)


def redact_sensitive(_logger: logging.Logger, _method_name: str, event_dict: dict) -> dict:
    """Processor de structlog: redacta secretos y contenido privado del evento.

    Se coloca inmediatamente antes del renderer (consola o JSON), de modo que
    cubre ambos formatos en un único punto. Conserva los campos no sensibles y
    el nivel/timestamp añadidos por los processors previos.
    """
    return {key: _redact(key, value) for key, value in event_dict.items()}


def configure_logging(log_level: str = "INFO", log_format: str = "json") -> None:
    """Configura structlog y el logging estándar una única vez por proceso."""
    global _configured

    level = getattr(logging, str(log_level).upper(), logging.INFO)

    # Raíz del logging estándar (stdlib) alimenta a structlog vía LoggerFactory.
    logging.basicConfig(level=level, format="%(message)s", force=True)

    processors: list = [
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        redact_sensitive,
    ]

    if str(log_format).lower() == "console":
        processors.append(structlog.dev.ConsoleRenderer())
    else:
        processors.append(structlog.processors.JSONRenderer())

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.stdlib.BoundLogger,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )
    _configured = True


def get_logger(name: str | None = None) -> structlog.stdlib.BoundLogger:
    """Devuelve un logger structlog enlazado.

    Si `configure_logging()` no se ha llamado aún (p. ej. en tests), se
    configura con los valores por defecto para que el logger sea utilizable.
    """
    if not _configured:
        configure_logging()
    return structlog.get_logger(name)
