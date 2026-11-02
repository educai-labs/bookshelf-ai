"""Tests de `apps/mcp/errors.py` (feature 019).

Cubren códigos/mensajes del error estructurado, conversión centralizada de
excepciones y sanitización (sin secretos ni texto crudo de excepción).
"""

from __future__ import annotations

import pytest
from google.api_core.exceptions import GoogleAPIError
from postgrest.exceptions import APIError
from pydantic import ValidationError

from errors import ErrorCode, MCPError, map_exception, parse_uuid, to_validation_error
from schemas import SearchBooksRequest


def test_mcp_error_codigo_y_mensaje():
    err = MCPError(ErrorCode.BOOK_NOT_FOUND, "no existe")
    assert err.code == ErrorCode.BOOK_NOT_FOUND
    assert err.message == "no existe"
    assert str(err) == "BOOK_NOT_FOUND: no existe"


def test_map_exception_devuelve_mcp_error_tal_cual():
    err = MCPError(ErrorCode.TIMEOUT, "tardó")
    assert map_exception(err) is err


def test_map_exception_google_api_error_sanitizado():
    err = map_exception(GoogleAPIError("AIza-SECRETO clave en el mensaje"))
    assert err.code == ErrorCode.GEMINI_ERROR
    assert "AIza-SECRETO" not in err.message
    assert err.message


def test_map_exception_timeout():

    err = map_exception(TimeoutError())
    assert err.code == ErrorCode.TIMEOUT


def test_map_exception_api_error_db():
    err = map_exception(APIError({"code": "42P01", "message": "relation no existe"}))
    assert err.code == ErrorCode.DB_ERROR
    assert "relation no existe" not in err.message


def test_map_exception_isbn_domain():
    from app.models.isbn import InvalidISBNError, ISBNNotFoundError

    invalid = map_exception(InvalidISBNError("123"))
    assert invalid.code == ErrorCode.INVALID_ISBN

    not_found = map_exception(ISBNNotFoundError("9780000000000"))
    assert not_found.code == ErrorCode.ISBN_NOT_FOUND


def test_map_exception_fallback_internal():
    err = map_exception(RuntimeError("algo raro"))
    assert err.code == ErrorCode.INTERNAL
    assert "algo raro" not in err.message


def test_parse_uuid_valido_e_invalido():
    from uuid import UUID

    assert parse_uuid("00000000-0000-0000-0000-000000000001") == UUID(
        "00000000-0000-0000-0000-000000000001"
    )
    with pytest.raises(MCPError) as exc_info:
        parse_uuid("no-uuid", field="book_id")
    assert exc_info.value.code == ErrorCode.INVALID_UUID
    assert "book_id" in exc_info.value.message


def test_to_validation_error_mensaje_legible():
    with pytest.raises(ValidationError) as exc_info:
        SearchBooksRequest(query="   ")
    err = to_validation_error(exc_info.value)
    assert err.code == ErrorCode.VALIDATION
    assert "query" in err.message
