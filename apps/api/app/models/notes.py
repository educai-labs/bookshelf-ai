r"""Modelos Pydantic de notas (feature 010).

Modelos request/response de los endpoints REST de `notes.py`
(`/books/{book_id}/notes`):

- `NoteCreate`: payload de `POST` (solo `content`; el HTML se renderiza y
  sanitiza en el endpoint, no se confía en el cliente).
- `NoteRead`: respuesta común (fila de `book_notes`).
- `NoteListResponse`: página de `NoteRead` con metadatos de paginación.

Validaciones (convención `tech-stack.md`): `content` entre 1 y 50000 chars
(Pydantic v2, `Field(min_length=1, max_length=50000)`), `page` ≥ 1,
`page_size` 1-50.
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class NoteCreate(BaseModel):
    """Payload de `POST /books/{book_id}/notes`.

    Solo `content` en Markdown: `content_html` se genera en el endpoint con
    `markdown2` + `bleach` (sanitizado XSS), nunca se acepta HTML del cliente.
    """

    model_config = {"extra": "forbid"}

    content: str = Field(
        min_length=1,
        max_length=50000,
        description="Contenido de la nota en Markdown (1-50000 caracteres)",
    )


class NoteRead(BaseModel):
    """Respuesta común de nota: fila de `book_notes` sin `embedding`.

    `embedding` (vector 768 dims) no se expone por tamaño; la feature 016
    gestionará los chunks/embeddings internamente.
    """

    model_config = {"from_attributes": True}

    id: UUID
    book_id: UUID
    content: str
    content_html: str
    chunk_index: int
    created_at: datetime


class NoteListResponse(BaseModel):
    """Página de notas con metadatos de paginación."""

    items: list[NoteRead]
    total: int
    page: int
    page_size: int
