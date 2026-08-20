"""Endpoints REST de notas (feature 010).

Dos endpoints bajo `/api/v1/books/{book_id}/notes`, ambos autenticados vía
`Depends(get_current_user)` + ownership check (`get_book_ownership`, 404 si el
libro no existe o es de otro usuario):

- `POST ""`: crea una nota. Valida `NoteCreate` (1-50000 chars), renderiza
  `content_html = markdown2.markdown(content)` y lo sanitiza con
  `bleach.clean()` (anti-XSS), inserta en `book_notes` con `chunk_index=0` y
  `embedding` placeholder (vector zeros 768), y dispara la vectorización real
  en background (`BackgroundTasks.add_task(vectorize_note, ...)`, feature 016).
  Retorna 201 con `NoteRead` sin bloquear la respuesta.
- `GET ""`: lista las notas del libro con paginación `.range()`, orden
  `created_at DESC`; filtra `chunk_index = 0` (solo notas "padres") salvo
  `include_chunks=true`.

Errores: `HTTPException` con `detail` estructurado `{code, message, field?}`
(convención `tech-stack.md`): 401 auth, 404 libro inexistente/ajeno, 422
validación Pydantic, 500 DB.
"""

from typing import Annotated
from uuid import UUID

import bleach
import markdown2
from fastapi import APIRouter, BackgroundTasks, Depends, Path, Query
from postgrest.exceptions import APIError
from supabase import Client

from app.api.v1.dependencies import get_book_ownership
from app.core.database import get_supabase
from app.core.errors import map_supabase_error
from app.core.security import get_current_user
from app.models.books import BookRead
from app.models.notes import NoteCreate, NoteListResponse, NoteRead
from app.services.vectorization import vectorize_note

router = APIRouter(prefix="/books/{book_id}/notes", tags=["notes"])

# Embedding placeholder: `book_notes.embedding` es NOT NULL (vector(768), modelo
# fijo text-embedding-004). La vectorización real (feature 016) sobrescribirá
# este vector de ceros con el embedding de la nota completa.
EMBEDDING_PLACEHOLDER = [0.0] * 768


# ---------------------------------------------------------------------------
# POST /books/{book_id}/notes
# ---------------------------------------------------------------------------


@router.post(
    "",
    response_model=NoteRead,
    status_code=201,
    summary="Crear nota + disparar vectorización en background",
    description=(
        "Valida `NoteCreate`, renderiza Markdown→HTML (sanitizado con bleach), "
        "inserta la nota en `book_notes` con `chunk_index=0` y encola la "
        "vectorización en background (feature 016). No bloquea la respuesta."
    ),
)
async def create_note(
    note_in: NoteCreate,
    book_id: Annotated[UUID, Path(description="ID del libro")],
    background_tasks: BackgroundTasks,
    supabase: Annotated[Client, Depends(get_supabase)],
    user_id: Annotated[str, Depends(get_current_user)],
    _book: Annotated[BookRead, Depends(get_book_ownership)],
) -> NoteRead:
    """Crea la nota (chunk_index=0) y dispara la vectorización en background."""
    content_html = bleach.clean(markdown2.markdown(note_in.content))
    data = {
        "user_id": user_id,
        "book_id": str(book_id),
        "content": note_in.content,
        "content_html": content_html,
        "chunk_index": 0,
        "embedding": EMBEDDING_PLACEHOLDER,
    }

    try:
        resp = supabase.table("book_notes").insert(data).execute()
    except APIError as exc:
        map_supabase_error(exc)

    row = resp.data[0]
    background_tasks.add_task(vectorize_note, row["id"], user_id, book_id, note_in.content)
    return _to_note_read(row)


# ---------------------------------------------------------------------------
# GET /books/{book_id}/notes
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=NoteListResponse,
    summary="Listar notas del libro (paginado)",
    description=(
        "Lista las notas del libro con paginación `.range()`, orden "
        "`created_at DESC`. Por defecto solo notas completas (`chunk_index = 0`); "
        "`include_chunks=true` incluye chunks vectoriales."
    ),
)
async def list_notes(
    book_id: Annotated[UUID, Path(description="ID del libro")],
    supabase: Annotated[Client, Depends(get_supabase)],
    user_id: Annotated[str, Depends(get_current_user)],
    _book: Annotated[BookRead, Depends(get_book_ownership)],
    page: Annotated[int, Query(ge=1, description="Página (empieza en 1)")] = 1,
    page_size: Annotated[int, Query(ge=1, le=50, description="Notas por página (1-50)")] = 20,
    include_chunks: Annotated[bool, Query(description="Incluir chunks vectoriales")] = False,
) -> NoteListResponse:
    """Página de notas con `.range()`; filtra `chunk_index=0` por defecto."""
    query = supabase.table("book_notes").select("*", count="exact")
    query = query.eq("book_id", str(book_id)).eq("user_id", user_id)
    if not include_chunks:
        query = query.eq("chunk_index", 0)
    query = query.order("created_at", desc=True)

    offset = (page - 1) * page_size
    resp = query.range(offset, offset + page_size - 1).execute()
    data = resp.data or []
    total = resp.count if resp.count is not None else len(data)

    return NoteListResponse(
        items=[_to_note_read(row) for row in data],
        total=total,
        page=page,
        page_size=page_size,
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _to_note_read(row: dict) -> NoteRead:
    """Convierte una fila de `book_notes` a `NoteRead` (sin `embedding`)."""
    return NoteRead(
        id=row["id"],
        book_id=row["book_id"],
        content=row["content"],
        content_html=row["content_html"],
        chunk_index=row["chunk_index"],
        created_at=row["created_at"],
    )
