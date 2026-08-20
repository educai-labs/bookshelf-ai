r"""Modelos Pydantic de libros (feature 009).

Modelos request/response de los 6 endpoints REST de `books.py`:

- `BookMetadata`: respuesta de `GET /books/lookup` (metadatos normalizados +
  `isbn13`).
- `BookCreate`: payload de `POST /books` (solo ISBN + campos editables; los
  metadatos se obtienen internamente vía `ISBNLookupService`).
- `BookUpdate`: payload de `PATCH /books/{id}` (campos editables; al menos uno).
- `BookRead`: respuesta común (fila de `books` + `notes_count`).
- `BookListResponse`: página de `BookRead` con metadatos de paginación.

Validaciones (convención `tech-stack.md`): `isbn13` regex `^\d{13}$`,
`rating` 1-5, `status` enum `book_status`, `page` ≥ 1, `page_size` 1-100.
"""

import re
from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.enums import BookStatus

ISBN13_PATTERN = re.compile(r"^\d{13}$")


def normalizar_isbn13(value: str) -> str:
    """Normaliza un ISBN-13: quita guiones/espacios y valida 13 dígitos.

    Lanza `ValueError` (→ 422 `VALIDATION_ERROR` en Pydantic) si tras la
    normalización no son exactamente 13 dígitos.
    """
    normalized = re.sub(r"[\s-]", "", value).strip()
    if not ISBN13_PATTERN.fullmatch(normalized):
        raise ValueError("El ISBN debe ser un código ISBN-13 de 13 dígitos")
    return normalized


class BookMetadata(BaseModel):
    """Respuesta de `GET /books/lookup`: metadatos normalizados + `isbn13`.

    `published_date` se conserva como string (formatos variados de las APIs
    externas: "2001", "2001-03-01", "March 2001"); la conversión a `date` se
    hace al persistir (`POST /books`).
    """

    model_config = ConfigDict(extra="ignore")

    title: str
    authors: list[str] = Field(default_factory=list)
    cover_url: str | None = None
    page_count: int | None = None
    publisher: str | None = None
    published_date: str | None = None
    description: str | None = None
    isbn13: str = Field(pattern=r"^\d{13}$")


class BookCreate(BaseModel):
    """Payload de `POST /books`.

    Solo `isbn13` + campos editables opcionales: los metadatos (title, authors,
    cover_url, page_count, publisher, published_date, description) se obtienen
    internamente vía `ISBNLookupService` (decisión del plan: "Crear libro desde
    ISBN", UX preview-antes-de-guardar).
    """

    model_config = ConfigDict(use_enum_values=True)

    isbn13: str = Field(pattern=r"^\d{13}$")
    status: BookStatus | None = None
    rating: int | None = Field(default=None, ge=1, le=5)
    started_at: date | None = None
    finished_at: date | None = None

    @field_validator("isbn13", mode="before")
    @classmethod
    def _normalizar_isbn(cls, value: str) -> str:
        """Normaliza el ISBN (guiones/espacios → 13 dígitos) antes de validar."""
        return normalizar_isbn13(value)


class BookUpdate(BaseModel):
    """Payload de `PATCH /books/{id}`: PATCH parcial con campos editables.

    Todos los campos opcionales; `model_validator` exige al menos uno presente
    (evita requests vacíos que no cambian nada).
    """

    model_config = ConfigDict(use_enum_values=True)

    status: BookStatus | None = None
    rating: int | None = Field(default=None, ge=1, le=5)
    started_at: date | None = None
    finished_at: date | None = None

    @model_validator(mode="after")
    def _al_menos_un_campo(self) -> "BookUpdate":
        if all(v is None for v in self.model_dump().values()):
            raise ValueError("Debe proporcionar al menos un campo a actualizar")
        return self


class BookRead(BaseModel):
    """Respuesta común de libro: fila de `books` + `notes_count`.

    `published_date`, `started_at` y `finished_at` son `date` (columnas DB);
    `created_at`/`updated_at` son `timestamptz`.
    """

    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

    id: UUID
    user_id: UUID
    isbn13: str
    title: str
    authors: list[str] = Field(default_factory=list)
    cover_url: str | None = None
    page_count: int | None = None
    publisher: str | None = None
    published_date: date | None = None
    description: str | None = None
    status: BookStatus
    rating: int | None = None
    started_at: date | None = None
    finished_at: date | None = None
    created_at: datetime
    updated_at: datetime
    notes_count: int = 0


class BookListResponse(BaseModel):
    """Página de libros con metadatos de paginación."""

    items: list[BookRead]
    total: int
    page: int
    page_size: int
    total_pages: int
