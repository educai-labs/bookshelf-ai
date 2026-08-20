"""Helpers de errores HTTP consistentes (convención `tech-stack.md`).

Formato estándar: `HTTPException` con `detail = {"code", "message", "field?"}`.
Los endpoints de `books.py` lanzan errores vía `raise_http_exception` y mapean
errores de Supabase/PostgREST con `map_supabase_error`:

- `23505` unique_violation → 409 `isbn_duplicate` (field `isbn13`)
- `23503` foreign_key_violation → 404 `BOOK_NOT_FOUND`
- `PGRST116` / `406` (`single()` sin filas o múltiples) → 404 `BOOK_NOT_FOUND`
- resto → 500 `DB_ERROR`
"""

from typing import NoReturn

from fastapi import HTTPException
from postgrest.exceptions import APIError

from app.core.logging import get_logger

logger = get_logger(__name__)


def raise_http_exception(
    code: str,
    message: str,
    field: str | None = None,
    status_code: int = 500,
) -> NoReturn:
    """Lanza `HTTPException` con `detail` estructurado `{code, message, field?}`."""
    detail: dict[str, str] = {"code": code, "message": message}
    if field is not None:
        detail["field"] = field
    raise HTTPException(status_code=status_code, detail=detail)


def raise_book_not_found() -> NoReturn:
    """404 estándar para libros inexistentes o de otro usuario."""
    raise_http_exception(
        "BOOK_NOT_FOUND",
        "El libro no existe o no pertenece al usuario",
        status_code=404,
    )


def map_supabase_error(exc: APIError) -> NoReturn:
    """Mapea un error de Supabase/PostgREST a `HTTPException` estándar."""
    if exc.code == "23505":  # unique_violation (books_isbn13_unique)
        raise_http_exception(
            "isbn_duplicate",
            "ISBN ya registrado",
            field="isbn13",
            status_code=409,
        )
    if exc.code in ("23503", "PGRST116", "406"):
        raise_book_not_found()
    logger.error(
        "supabase_error",
        code=exc.code,
        message=exc.message,
        details=exc.details,
    )
    raise_http_exception(
        "DB_ERROR",
        "Error inesperado de base de datos",
        status_code=500,
    )
