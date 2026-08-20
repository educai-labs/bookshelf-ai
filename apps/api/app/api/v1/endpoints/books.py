"""Endpoints REST de libros (feature 009).

6 endpoints bajo `/api/v1/books`, todos autenticados vía
`Depends(get_current_user)` (el `user_id` del JWT aísla los datos por usuario;
el cliente `service_role` bypassa RLS, así que cada query filtra por
`user_id` explícitamente).

- `GET /lookup`: metadatos por ISBN (delega en `ISBNLookupService`, feature 008).
- `POST /`: alta desde ISBN (lookup interno + insert).
- `GET /`: listado paginado con filtros (status, rating, q título/autor).
- `GET/PATCH/DELETE /{book_id}`: obtener, actualizar parcial y borrar (cascada).

Errores: `HTTPException` con `detail` estructurado `{code, message, field?}`
(convención `tech-stack.md`): 401 auth, 404 no encontrado, 409 ISBN duplicado,
422 validación Pydantic, 500 DB / red.
"""

import math
from datetime import UTC, date, datetime
from typing import Annotated
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, Path, Query
from postgrest.exceptions import APIError
from supabase import Client

from app.core.database import get_supabase
from app.core.errors import (
    map_supabase_error,
    raise_book_not_found,
    raise_http_exception,
)
from app.core.security import get_current_user
from app.models.books import BookCreate, BookListResponse, BookMetadata, BookRead, BookUpdate
from app.models.isbn import InvalidISBNError, ISBNLookupResponse, ISBNNotFoundError
from app.schemas.enums import BookStatus
from app.services.isbn_lookup import ISBNLookupService, get_lookup_service

router = APIRouter(prefix="/books", tags=["books"])


# ---------------------------------------------------------------------------
# GET /books/lookup
# ---------------------------------------------------------------------------


@router.get(
    "/lookup",
    response_model=BookMetadata,
    summary="Buscar libro por ISBN-13",
    description=(
        "Metadatos normalizados de un libro a partir de su ISBN-13 (Open Library "
        "primario, Google Books fallback, caché 1h). No persiste el libro."
    ),
)
async def lookup_book(
    isbn: Annotated[str, Query(pattern=r"^\d{13}$", description="ISBN-13 del libro a buscar")],
    service: Annotated[ISBNLookupService, Depends(get_lookup_service)],
    user_id: Annotated[str, Depends(get_current_user)],
) -> BookMetadata:
    """Delega en `ISBNLookupService.buscar()` y devuelve metadatos + `isbn13`."""
    try:
        resultado: ISBNLookupResponse = await service.buscar(isbn)
    except InvalidISBNError as exc:
        raise_http_exception(exc.code, exc.message, status_code=422)
    except ISBNNotFoundError as exc:
        raise_http_exception(exc.code, exc.message, status_code=404)
    except (httpx.TimeoutException, httpx.NetworkError):
        raise_http_exception(
            "LOOKUP_FAILED",
            "Error de red al consultar las APIs de búsqueda; inténtalo de nuevo",
            status_code=500,
        )
    return BookMetadata(**resultado.model_dump(), isbn13=isbn)


# ---------------------------------------------------------------------------
# POST /books
# ---------------------------------------------------------------------------


@router.post(
    "",
    response_model=BookRead,
    status_code=201,
    summary="Crear libro desde ISBN",
    description=(
        "Busca los metadatos del ISBN internamente (`ISBNLookupService`) y crea "
        "el libro en `books` con el `user_id` del JWT. 409 si el ISBN ya está "
        "registrado para este usuario."
    ),
)
async def create_book(
    book_in: BookCreate,
    service: Annotated[ISBNLookupService, Depends(get_lookup_service)],
    supabase: Annotated[Client, Depends(get_supabase)],
    user_id: Annotated[str, Depends(get_current_user)],
) -> BookRead:
    """Lookup interno por ISBN + insert en `books` con `user_id` del JWT."""
    try:
        metadata: ISBNLookupResponse = await service.buscar(book_in.isbn13)
    except ISBNNotFoundError as exc:
        raise_http_exception(exc.code, exc.message, status_code=404)
    except (httpx.TimeoutException, httpx.NetworkError):
        raise_http_exception(
            "LOOKUP_FAILED",
            "Error de red al consultar las APIs de búsqueda; inténtalo de nuevo",
            status_code=500,
        )

    parsed_date = _parse_published_date(metadata.published_date)
    data: dict = {
        "user_id": user_id,
        "isbn13": book_in.isbn13,
        "title": metadata.title,
        "authors": metadata.authors,
        "cover_url": metadata.cover_url,
        "page_count": metadata.page_count,
        "publisher": metadata.publisher,
        "published_date": parsed_date.isoformat() if parsed_date else None,
        "description": metadata.description,
    }
    if book_in.status is not None:
        data["status"] = book_in.status
    if book_in.rating is not None:
        data["rating"] = book_in.rating
    if book_in.started_at is not None:
        data["started_at"] = book_in.started_at.isoformat()
    if book_in.finished_at is not None:
        data["finished_at"] = book_in.finished_at.isoformat()

    try:
        resp = supabase.table("books").insert(data).execute()
    except APIError as exc:
        map_supabase_error(exc)

    return _to_book_read(resp.data[0], notes_count=0)


# ---------------------------------------------------------------------------
# GET /books (listado paginado con filtros)
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=BookListResponse,
    summary="Listar libros (paginado, filtros)",
    description=(
        "Lista los libros del usuario autenticado. Filtros opcionales: `status` "
        "(enum), `rating` (1-5) y `q` (búsqueda case-insensitive por título o "
        "autor). Incluye `notes_count` por libro."
    ),
)
async def list_books(
    supabase: Annotated[Client, Depends(get_supabase)],
    user_id: Annotated[str, Depends(get_current_user)],
    page: Annotated[int, Query(ge=1, description="Página (empieza en 1)")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="Libros por página (1-100)")] = 20,
    status: Annotated[BookStatus | None, Query(description="Filtrar por estado de lectura")] = None,
    rating: Annotated[
        int | None, Query(ge=1, le=5, description="Filtrar por rating exacto")
    ] = None,
    q: Annotated[
        str | None,
        Query(min_length=1, description="Búsqueda por título o autor (case-insensitive)"),
    ] = None,
) -> BookListResponse:
    """Página de libros con `.range()` (paginación Supabase) y filtros `.eq()`."""
    base = supabase.table("books")
    query = base.select("*, book_notes(count)", count="exact").eq("user_id", user_id)

    if status is not None:
        query = query.eq("status", status.value)
    if rating is not None:
        query = query.eq("rating", rating)

    if q:
        matched_ids = _ids_que_coinciden_con_q(base, user_id, q)
        if not matched_ids:
            return _pagina_vacia(page, page_size)
        query = query.in_("id", matched_ids)

    offset = (page - 1) * page_size
    resp = query.range(offset, offset + page_size - 1).execute()
    data = resp.data or []
    total = resp.count if resp.count is not None else len(data)
    total_pages = math.ceil(total / page_size) if total else 0

    return BookListResponse(
        items=[_to_book_read(row) for row in data],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


# ---------------------------------------------------------------------------
# GET /books/{book_id}
# ---------------------------------------------------------------------------


@router.get(
    "/{book_id}",
    response_model=BookRead,
    summary="Obtener libro + notes_count",
    description="Devuelve el libro si existe y pertenece al usuario autenticado.",
)
async def get_book(
    book_id: Annotated[UUID, Path(description="ID del libro")],
    supabase: Annotated[Client, Depends(get_supabase)],
    user_id: Annotated[str, Depends(get_current_user)],
) -> BookRead:
    """Libro con `notes_count` via `.select("*, book_notes(count)").single()`."""
    libro = _fetch_book(supabase, user_id, book_id)
    if libro is None:
        raise_book_not_found()
    return libro


# ---------------------------------------------------------------------------
# PATCH /books/{book_id}
# ---------------------------------------------------------------------------


@router.patch(
    "/{book_id}",
    response_model=BookRead,
    summary="Actualizar campos editables",
    description=(
        "PATCH parcial: solo actualiza los campos enviados (status, rating, "
        "started_at, finished_at). `updated_at` lo actualiza el trigger de DB."
    ),
)
async def update_book(
    book_id: Annotated[UUID, Path(description="ID del libro")],
    book_in: BookUpdate,
    supabase: Annotated[Client, Depends(get_supabase)],
    user_id: Annotated[str, Depends(get_current_user)],
) -> BookRead:
    """`.update()` solo con los campos proporcionados; 404 si no existe/pertenece."""
    updates = book_in.model_dump(exclude_unset=True, exclude_none=True)
    for campo in ("started_at", "finished_at"):
        if campo in updates:
            updates[campo] = updates[campo].isoformat()

    try:
        resp = (
            supabase.table("books")
            .update(updates)
            .eq("id", str(book_id))
            .eq("user_id", user_id)
            .execute()
        )
    except APIError as exc:
        map_supabase_error(exc)

    if not resp.data:
        raise_book_not_found()

    libro = _fetch_book(supabase, user_id, book_id)
    if libro is None:
        raise_book_not_found()
    return libro


# ---------------------------------------------------------------------------
# DELETE /books/{book_id}
# ---------------------------------------------------------------------------


@router.delete(
    "/{book_id}",
    status_code=204,
    summary="Borrar libro (cascada notas)",
    description=(
        "Borra el libro; RLS + FK ON DELETE CASCADE borran sus notas. "
        "204 No Content si se borra; 404 si no existe o no pertenece al usuario."
    ),
)
async def delete_book(
    book_id: Annotated[UUID, Path(description="ID del libro")],
    supabase: Annotated[Client, Depends(get_supabase)],
    user_id: Annotated[str, Depends(get_current_user)],
) -> None:
    """`.delete()` filtrado por `user_id`; RLS + FK CASCADE borran las notas."""
    try:
        resp = (
            supabase.table("books").delete().eq("id", str(book_id)).eq("user_id", user_id).execute()
        )
    except APIError as exc:
        map_supabase_error(exc)

    if not resp.data:
        raise_book_not_found()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _fetch_book(supabase: Client, user_id: str, book_id: UUID) -> BookRead | None:
    """Libro con `notes_count` si existe y pertenece al usuario; `None` si no."""
    try:
        resp = (
            supabase.table("books")
            .select("*, book_notes(count)")
            .eq("id", str(book_id))
            .eq("user_id", user_id)
            .single()
            .execute()
        )
    except APIError as exc:
        if exc.code in ("PGRST116", "406"):
            return None
        map_supabase_error(exc)
    if resp is None:  # defensivo: single() sin filas sin error
        return None
    return _to_book_read(resp.data)


def _ids_que_coinciden_con_q(base, user_id: str, q: str) -> list[str]:
    """IDs de libros cuyo título (DB ILIKE) o algún autor (Python) coincide con `q`.

    PostgREST 14 no soporta `ilike` sobre columnas `text[]` (error 42883), así
    que la coincidencia por autor se resuelve en Python sobre `id, authors`
    (dataset pequeño por usuario en MVP; la búsqueda full-text/trigram es una
    feature futura, fuera de alcance de 009).
    """
    q_lower = q.lower()

    title_rows = base.select("id").eq("user_id", user_id).ilike("title", f"%{q}%").execute()
    title_ids = [row["id"] for row in (title_rows.data or [])]

    author_rows = base.select("id, authors").eq("user_id", user_id).execute()
    author_ids = [
        row["id"]
        for row in (author_rows.data or [])
        if any(q_lower in (autor or "").lower() for autor in row.get("authors") or [])
    ]

    return list(dict.fromkeys([*title_ids, *author_ids]))


def _pagina_vacia(page: int, page_size: int) -> BookListResponse:
    """Página sin resultados con total 0 (evita queries si `q` no matchea nada)."""
    return BookListResponse(
        items=[],
        total=0,
        page=page,
        page_size=page_size,
        total_pages=0,
    )


def _to_book_read(row: dict, notes_count: int | None = None) -> BookRead:
    """Convierte una fila de Supabase (con `book_notes(count)` opcional) a `BookRead`."""
    if notes_count is None:
        notas = row.get("book_notes") or []
        notes_count = notas[0]["count"] if notas else 0
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
        notes_count=notes_count,
    )


def _parse_published_date(value: str | None) -> date | None:
    """Convierte `published_date` (string, formatos variados) a `date`.

    Formatos aceptados: ISO (`2001-03-01`), año (`2001`), mes año
    (`March 2001` / `Mar 2001`). Si no se puede parsear → `None` (columna
    nullable); nunca falla el alta por un formato raro de la API externa.
    """
    if not value:
        return None
    value = value.strip()
    for formato in ("%Y-%m-%d", "%Y", "%B %Y", "%b %Y"):
        try:
            parsed = datetime.strptime(value, formato).replace(tzinfo=UTC)
            return parsed.date()
        except ValueError:
            continue
    return None
