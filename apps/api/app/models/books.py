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

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.enums import BookStatus
from app.models.isbn import InvalidISBNError, normalizar_isbn


def normalizar_isbn13(value: str) -> str:
    """Normaliza un ISBN-13: quita guiones/espacios y valida 13 dígitos.

    Lanza `ValueError` (→ 422 `VALIDATION_ERROR` en Pydantic) si tras la
    normalización no son exactamente 13 dígitos. Reutiliza `normalizar_isbn`
    del dominio ISBN (que lanza `InvalidISBNError`).
    """
    try:
        return normalizar_isbn(value)
    except InvalidISBNError:
        raise ValueError("El ISBN debe ser un código ISBN-13 de 13 dígitos") from None


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


def to_book_read(row: dict, notes_count: int | None = None) -> BookRead:
    """Convierte una fila de `books` (con `book_notes(count)` opcional) a `BookRead`.

    `notes_count` se lee del agregado `book_notes(count)` salvo que se pase
    explícitamente (p. ej. 0 en el alta, cuando aún no hay notas).
    """
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
