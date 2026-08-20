"""Dependencies reutilizables de la API v1 (feature 010).

`get_book_ownership`: dependency de ownership que verifica que el libro del
path pertenece al usuario autenticado (404 si no existe o es de otro usuario,
no 403, para no filtrar existencia). Se usa en los routers de books y notes.
"""

from typing import Annotated
from uuid import UUID

from fastapi import Depends
from postgrest.exceptions import APIError
from supabase import Client

from app.core.database import get_supabase
from app.core.errors import map_supabase_error, raise_book_not_found
from app.core.security import get_current_user
from app.models.books import BookRead


async def get_book_ownership(
    book_id: UUID,
    user_id: Annotated[str, Depends(get_current_user)],
    supabase: Annotated[Client, Depends(get_supabase)],
) -> BookRead:
    """Dependency: el `book_id` debe pertenecer al usuario autenticado.

    Query: `SELECT * FROM books WHERE id = book_id AND user_id = user_id`.

    Devuelve el `BookRead` si el libro existe y es del usuario; lanza 404
    `BOOK_NOT_FOUND` si no (mismo criterio que `books.py`: no filtrar
    existencia de libros ajenos). Reutilizable en rutas bajo
    `/books/{book_id}/...` — `book_id` se resuelve del path, `user_id` del JWT.
    """
    try:
        resp = (
            supabase.table("books")
            .select("*")
            .eq("id", str(book_id))
            .eq("user_id", user_id)
            .single()
            .execute()
        )
    except APIError as exc:
        if exc.code in ("PGRST116", "406"):
            raise_book_not_found()
        map_supabase_error(exc)
    if resp is None:  # defensivo: single() sin filas sin error
        raise_book_not_found()
    return _book_from_row(resp.data)


def _book_from_row(row: dict) -> BookRead:
    """Convierte una fila de `books` (sin `book_notes(count)`) a `BookRead`."""
    return BookRead(
        id=row["id"],
        user_id=row["user_id"],
        isbn13=str(row.get("isbn13") or "").strip(),
        title=row["title"],
        authors=list(row.get("authors") or []),
        cover_url=row.get("cover_url"),
        page_count=row.get("page_count"),
        publisher=row.get("publisher"),
        published_date=row.get("published_date"),
        description=row.get("description"),
        status=row["status"],
        rating=row.get("rating"),
        started_at=row.get("started_at"),
        finished_at=row.get("finished_at"),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        notes_count=0,
    )
