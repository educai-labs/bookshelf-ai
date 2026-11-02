"""Esquemas Pydantic de entrada y salida de las 5 tools (feature 019).

Los modelos de **salida** son la fuente del output-schema que FastMCP serializa
y valida en cada respuesta. Los modelos de **entrada** concentran la validación
explícita (no vacío, no solo espacios, longitud) y documentan el contrato.

Contratos:
- `BookSummary`: `id, title, authors[], status, rating` — `rating` nulable y
  `status` enum `book_status`.
- `NoteSummary`: `id, content, created_at`.
- `ChatResponse`: respuesta completa (texto único, sin streaming).
- `NoteCreatedResponse`: nota creada.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class BookStatus(str, Enum):
    """Estado de lectura (mismo enum `book_status` del dominio)."""

    want_to_read = "want_to_read"
    reading = "reading"
    read = "read"


# ---------------------------------------------------------------------------
# Entrada (modelos de validación explícita)
# ---------------------------------------------------------------------------


class SearchBooksRequest(BaseModel):
    """Entrada de `search_books`: `query` no vacía ni solo espacios."""

    model_config = ConfigDict(extra="forbid")

    query: str = Field(min_length=1, max_length=500)

    @field_validator("query")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("query no puede ser vacío o solo espacios")
        return value


class GetBookNotesRequest(BaseModel):
    """Entrada de `get_book_notes`: `book_id` (UUID)."""

    model_config = ConfigDict(extra="forbid")

    book_id: str = Field(min_length=1)


class ChatWithLibraryRequest(BaseModel):
    """Entrada de `chat_with_library`: `query` + `book_id` opcional."""

    model_config = ConfigDict(extra="forbid")

    query: str = Field(min_length=1, max_length=50000)
    book_id: str | None = None

    @field_validator("query")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("query no puede ser vacío o solo espacios")
        return value


class CreateBookRequest(BaseModel):
    """Entrada de `create_book`: ISBN (10 o 13, con guiones/espacios)."""

    model_config = ConfigDict(extra="forbid")

    isbn: str = Field(min_length=1, max_length=32)

    @field_validator("isbn")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("isbn no puede ser vacío o solo espacios")
        return value


class CreateNoteRequest(BaseModel):
    """Entrada de `create_note`: `book_id` + contenido Markdown (1-50000)."""

    model_config = ConfigDict(extra="forbid")

    book_id: str = Field(min_length=1)
    content: str = Field(min_length=1, max_length=50000)

    @field_validator("content")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("content no puede ser vacío o solo espacios")
        return value


# ---------------------------------------------------------------------------
# Salida
# ---------------------------------------------------------------------------


class BookSummary(BaseModel):
    """Resumen de libro devuelto por `search_books` y `create_book`.

    `status` es un enum (serializado a su valor string en JSON); `rating` es
    nulable (libro nunca puntuado).
    """

    id: UUID
    title: str
    authors: list[str] = Field(default_factory=list)
    status: BookStatus
    rating: int | None = None


class SearchBooksResponse(BaseModel):
    """Respuesta de `search_books`: lista de libros (vacía si no hay coincidencias)."""

    books: list[BookSummary] = Field(default_factory=list)


class NoteSummary(BaseModel):
    """Nota completa (`chunk_index = 0`) devuelta por `get_book_notes`."""

    id: UUID
    content: str
    created_at: datetime


class GetBookNotesResponse(BaseModel):
    """Respuesta de `get_book_notes`: notas ordenadas por `created_at` desc."""

    notes: list[NoteSummary] = Field(default_factory=list)


class ChatResponse(BaseModel):
    """Respuesta completa del chat (texto único, sin streaming)."""

    answer: str


class NoteCreatedResponse(BaseModel):
    """Nota creada devuelta por `create_note`."""

    id: UUID
    content: str
    created_at: datetime


# ---------------------------------------------------------------------------
# Constructores (mapeo fila DB → modelo de salida)
# ---------------------------------------------------------------------------


def to_book_summary(row: dict) -> BookSummary:
    """Construye `BookSummary` desde una fila de `books` (columnas del contrato)."""
    return BookSummary(
        id=row["id"],
        title=row.get("title") or "",
        authors=list(row.get("authors") or []),
        status=row.get("status") or BookStatus.want_to_read,
        rating=row.get("rating"),
    )


def to_note_summary(row: dict) -> NoteSummary:
    """Construye `NoteSummary` desde una fila de `book_notes` (columnas del contrato)."""
    return NoteSummary(
        id=row["id"],
        content=row["content"],
        created_at=row["created_at"],
    )
