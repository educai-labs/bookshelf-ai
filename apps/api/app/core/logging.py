"""Logging estructurado con structlog.

- Producción (`LOG_LEVEL=INFO` o superior): `JSONRenderer` → logs parseables en
  agregadores (Datadog, Loki, CloudWatch).
- Desarrollo (`LOG_LEVEL=DEBUG`): `ConsoleRenderer` → pretty console legible.
"""

import logging

import structlog

_configured = False


def configure_logging(log_level: str = "INFO") -> None:
    """Configura structlog y el logging estándar una única vez por proceso."""
    global _configured

    level = getattr(logging, log_level.upper(), logging.INFO)

    # Raíz del logging estándar (stdlib) alimenta a structlog vía LoggerFactory.
    logging.basicConfig(level=level, format="%(message)s", force=True)

    processors: list = [
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]

    if level >= logging.INFO:
        processors.append(structlog.processors.JSONRenderer())
    else:
        processors.append(structlog.dev.ConsoleRenderer())

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
