"""Tests unitarios del mapeador común de errores de Supabase/PostgREST (feature 024).

Verifican que `map_supabase_error`:
- mapea `PGRST205` (tabla/columna ausente) y `PGRST202` (función ausente) a
  HTTP 503 `DB_MIGRATION_MISSING` con mensaje accionable (contexto del objeto +
  remedio operativo);
- conserva intactos los mapeos existentes (`23505`, `23503`, `PGRST116`, `406`)
  y el fallback `DB_ERROR` para códigos desconocidos.

No requieren red ni base de datos: se usa una `APIError` simulada (mismo patrón
que `tests/test_books.py`).
"""

import pytest
from fastapi import HTTPException
from postgrest.exceptions import APIError

from app.core.errors import map_supabase_error


def _api_error(code: str, message: str = "error", details: str | None = None) -> APIError:
    return APIError({"code": code, "message": message, "details": details})


def _raise(exc: APIError) -> HTTPException:
    with pytest.raises(HTTPException) as excinfo:
        map_supabase_error(exc)
    return excinfo.value


# ---------------------------------------------------------------------------
# PGRST205 / PGRST202 → 503 DB_MIGRATION_MISSING
# ---------------------------------------------------------------------------


def test_pgrst205_tabla_ausente_503():
    http = _raise(
        _api_error(
            "PGRST205",
            "Could not find the table 'public.account_preferences' in the schema cache",
        )
    )

    assert http.status_code == 503
    detail = http.detail
    assert detail["code"] == "DB_MIGRATION_MISSING"
    assert "account_preferences" in detail["message"]
    assert "supabase db push --include-all" in detail["message"]
    assert "npm run verify:schema" in detail["message"]


def test_pgrst205_columna_ausente_503():
    http = _raise(
        _api_error(
            "PGRST205",
            "Could not find the column 'public.books.missing_col' in the schema cache",
        )
    )

    assert http.status_code == 503
    assert http.detail["code"] == "DB_MIGRATION_MISSING"
    assert "missing_col" in http.detail["message"]


def test_pgrst202_funcion_ausente_503():
    http = _raise(
        _api_error(
            "PGRST202",
            "Could not find the function public.match_book_notes in the schema cache",
        )
    )

    assert http.status_code == 503
    detail = http.detail
    assert detail["code"] == "DB_MIGRATION_MISSING"
    assert "match_book_notes" in detail["message"]
    assert "supabase db push --include-all" in detail["message"]
    assert "npm run verify:schema" in detail["message"]


def test_pgrst205_sin_nombre_sigue_dando_503_y_remedio():
    http = _raise(_api_error("PGRST205", "Could not find the table in the schema cache"))

    assert http.status_code == 503
    assert http.detail["code"] == "DB_MIGRATION_MISSING"
    assert "supabase db push --include-all" in http.detail["message"]
    assert "npm run verify:schema" in http.detail["message"]


# ---------------------------------------------------------------------------
# Regresión: mapeos existentes sin cambios
# ---------------------------------------------------------------------------


def test_23505_409_isbn_duplicate():
    http = _raise(
        _api_error(
            "23505",
            'duplicate key value violates unique constraint "books_isbn13_unique"',
            "Key (user_id, isbn13) already exists.",
        )
    )

    assert http.status_code == 409
    assert http.detail == {
        "code": "isbn_duplicate",
        "message": "ISBN ya registrado",
        "field": "isbn13",
    }


def test_23503_404_book_not_found():
    http = _raise(_api_error("23503", "foreign key violation"))

    assert http.status_code == 404
    assert http.detail == {
        "code": "BOOK_NOT_FOUND",
        "message": "El libro no existe o no pertenece al usuario",
    }


def test_pgrst116_404_book_not_found():
    http = _raise(_api_error("PGRST116", "Cannot coerce the result to a single JSON object"))

    assert http.status_code == 404
    assert http.detail["code"] == "BOOK_NOT_FOUND"


def test_406_404_book_not_found():
    http = _raise(_api_error("406", "Cannot coerce the result to a single JSON object"))

    assert http.status_code == 404
    assert http.detail["code"] == "BOOK_NOT_FOUND"


def test_codigo_desconocido_500_db_error():
    http = _raise(_api_error("XX000", "unknown error"))

    assert http.status_code == 500
    assert http.detail == {
        "code": "DB_ERROR",
        "message": "Error inesperado de base de datos",
    }
