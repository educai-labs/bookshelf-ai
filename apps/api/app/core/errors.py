"""Helpers de errores HTTP consistentes (convención `tech-stack.md`).

Formato estándar: `HTTPException` con `detail = {"code", "message", "field?"}`.
Los endpoints de `books.py` lanzan errores vía `raise_http_exception` y mapean
errores de Supabase/PostgREST con `map_supabase_error`:

- `23505` unique_violation → 409 `isbn_duplicate` (field `isbn13`)
- `23503` foreign_key_violation → 404 `BOOK_NOT_FOUND`
- `PGRST116` / `406` (`single()` sin filas o múltiples) → 404 `BOOK_NOT_FOUND`
- `PGRST205` (tabla/columna ausente) → 503 `DB_MIGRATION_MISSING`
- `PGRST202` (función ausente) → 503 `DB_MIGRATION_MISSING`
- resto → 500 `DB_ERROR`
"""

import re
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


_DB_MIGRATION_REMEDY = (
    "Aplica las migraciones pendientes: `supabase db push --include-all` "
    "y verifica con `npm run verify:schema`."
)


def _missing_object_name(exc: APIError) -> str | None:
    """Extrae el nombre del objeto ausente del mensaje PostgREST (no sensible).

    Cubre las tres formas que emite PostgREST:
    - "Could not find the table 'public.<tabla>' in the schema cache"   (PGRST205)
    - "Could not find the column 'public.<tabla>.<columna>'"            (PGRST205)
    - "Could not find the function public.<funcion>(...) in the schema cache" (PGRST202)
    """
    message = exc.message or ""
    match = re.search(
        r"table ['\"](?:[a-z_][a-z0-9_]*\.)*([a-z_][a-z0-9_]*)['\"]",
        message,
        re.IGNORECASE,
    )
    if match:
        return match.group(1)
    match = re.search(
        r"column ['\"](?:[a-z_][a-z0-9_]*\.)*([a-z_][a-z0-9_]*)['\"]",
        message,
        re.IGNORECASE,
    )
    if match:
        return match.group(1)
    match = re.search(
        r"function\s+(?:[a-z_][a-z0-9_]*\.)*([a-z_][a-z0-9_]*)",
        message,
        re.IGNORECASE,
    )
    if match:
        return match.group(1)
    return None


def raise_db_migration_missing(exc: APIError) -> NoReturn:
    """503 `DB_MIGRATION_MISSING` para esquema ausente (PGRST205/PGRST202).

    Identifica la tabla/columna o función ausente cuando el mensaje la incluye y
    siempre indica el remedio operativo (`supabase db push --include-all` +
    `npm run verify:schema`). El código PostgREST y el objeto quedan en el log
    (sin secretos) para diagnóstico.
    """
    nombre = _missing_object_name(exc)
    if exc.code == "PGRST205":
        faltante = f"la tabla o columna '{nombre}'" if nombre else None
    else:  # PGRST202
        faltante = f"la función '{nombre}'" if nombre else "la función"

    if faltante:
        message = f"Esquema de base de datos no migrado: falta {faltante}. {_DB_MIGRATION_REMEDY}"
    else:
        message = (
            f"Esquema de base de datos no migrado (PostgREST {exc.code}). {_DB_MIGRATION_REMEDY}"
        )

    logger.error("db_migration_missing", code=exc.code, object_name=nombre)
    raise_http_exception("DB_MIGRATION_MISSING", message, status_code=503)


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
    if exc.code in ("PGRST205", "PGRST202"):
        raise_db_migration_missing(exc)
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
