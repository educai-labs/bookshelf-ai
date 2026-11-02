"""Errores estructurados MCP (feature 019).

Define los códigos de error estables y la conversión centralizada de
excepciones a errores MCP estructurados `{code, message}`. Los errores se
lanzan como `ToolError` de FastMCP; con `mask_error_details=True` (servidor),
solo estos mensajes explícitos llegan al agente: sin stack traces, sin texto
crudo de excepción, sin secretos ni detalles de conexión.
"""

from __future__ import annotations

from typing import NoReturn
from uuid import UUID

from fastmcp.exceptions import ToolError
from pydantic import ValidationError


class ErrorCode:
    """Códigos de error estables (testables) del servidor MCP."""

    VALIDATION = "VALIDATION_ERROR"
    INVALID_UUID = "INVALID_UUID"
    BOOK_NOT_FOUND = "BOOK_NOT_FOUND"
    NOTE_NOT_FOUND = "NOTE_NOT_FOUND"
    INVALID_ISBN = "INVALID_ISBN"
    ISBN_NOT_FOUND = "ISBN_NOT_FOUND"
    ISBN_DUPLICATE = "ISBN_DUPLICATE"
    LOOKUP_FAILED = "LOOKUP_FAILED"
    GEMINI_ERROR = "GEMINI_ERROR"
    DB_ERROR = "DB_ERROR"
    TIMEOUT = "TIMEOUT"
    INTERNAL = "INTERNAL_ERROR"


class MCPError(ToolError):
    """Error MCP estructurado: `code` + `message` (se serializa `code: message`)."""

    def __init__(self, code: str, message: str) -> None:
        self.code = code
        self.message = message
        super().__init__(f"{code}: {message}")


def raise_error(code: str, message: str) -> NoReturn:
    """Lanza un `MCPError` estructurado (código + mensaje legible)."""
    raise MCPError(code, message)


def parse_uuid(value: str, *, field: str = "id") -> UUID:
    """Convierte `value` a UUID; lanza `INVALID_UUID` si no es válido."""
    try:
        return UUID(value)
    except (ValueError, TypeError, AttributeError):
        raise_error(ErrorCode.INVALID_UUID, f"El valor de '{field}' debe ser un UUID válido.")


def _validation_message(exc: ValidationError) -> str:
    """Mensaje legible desde un `ValidationError` de Pydantic (sin ruido interno)."""
    errors = exc.errors()
    if not errors:
        return "Entrada inválida."
    err = errors[0]
    field = str(err.get("loc")[-1]) if err.get("loc") else None
    msg = str(err.get("msg", ""))
    # Pydantic v2 envuelve los ValueError de `field_validator` como "Value error, <msg>".
    msg = msg.removeprefix("Value error, ")
    return f"{field}: {msg}" if field else msg


def to_validation_error(exc: ValidationError) -> MCPError:
    """Convierte un `ValidationError` de Pydantic en `MCPError` VALIDATION."""
    return MCPError(ErrorCode.VALIDATION, _validation_message(exc))


def map_exception(exc: BaseException, *, fallback: str = ErrorCode.INTERNAL) -> MCPError:
    """Conversión centralizada de excepciones de dependencia a `MCPError`.

    Nunca incluye el texto crudo de la excepción ni secretos en el mensaje:
    cada categoría produce un mensaje legible y estable para el agente. Las
    excepciones ya convertidas (`MCPError`) se devuelven tal cual.
    """
    if isinstance(exc, MCPError):
        return exc

    # Errores de dominio del backend (ISBN) que ya exponen `code`/`message`.
    code = getattr(exc, "code", None)
    if code in (ErrorCode.INVALID_ISBN, ErrorCode.ISBN_NOT_FOUND):
        return MCPError(code, getattr(exc, "message", None) or str(exc))

    module = type(exc).__module__
    name = type(exc).__name__

    if module == "google.api_core.exceptions":
        return MCPError(ErrorCode.GEMINI_ERROR, "El servicio de IA falló. Inténtalo de nuevo.")
    if name in ("TimeoutError", "TimeoutException"):
        return MCPError(ErrorCode.TIMEOUT, "La operación excedió el tiempo límite.")
    if module == "postgrest.exceptions":
        return MCPError(ErrorCode.DB_ERROR, "Error de base de datos. Inténtalo de nuevo.")
    if module.startswith("httpx"):
        return MCPError(ErrorCode.DB_ERROR, "Error de conexión. Inténtalo de nuevo.")

    return MCPError(fallback, "Error interno del servidor.")
