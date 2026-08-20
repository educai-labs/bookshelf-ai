"""Modelo de metadatos normalizados de un libro (feature 007)."""

import re
from datetime import date

from pydantic import BaseModel, ConfigDict, Field, field_validator

# ISBN-13 tal y como se almacena en DB (columna `books.isbn13`, CHECK regex).
ISBN13_PATTERN = r"^\d{13}$"


def normalize_isbn13(value: str | None) -> str | None:
    """Normaliza un ISBN-13 quitando guiones/espacios y valida el patrón.

    Acepta `978-84-12345-67-8` o `978 84 12345 67 8` y lo reduce a
    `9788412345678` (13 dígitos). Devuelve `None` si la entrada es `None`
    (campos opcionales de `BookUpdate`).
    """
    if value is None:
        return None
    normalized = str(value).replace("-", "").replace(" ", "").strip()
    if not re.fullmatch(ISBN13_PATTERN, normalized):
        raise ValueError("El ISBN debe ser un código ISBN-13 de 13 dígitos")
    return normalized


class BookMetadata(BaseModel):
    """Metadatos normalizados de un libro.

    Base para `BookCreate` (POST /books), `BookRead` (GET) y `BookUpdate`
    (PATCH). `isbn` se normaliza a 13 dígitos; `page_count` debe ser > 0
    cuando se provee.
    """

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
        use_enum_values=True,
    )

    isbn: str
    title: str
    authors: list[str] = Field(default_factory=list)
    publisher: str | None = None
    published_date: date | None = None
    description: str | None = None
    page_count: int | None = Field(
        default=None,
        gt=0,
        description="Número de páginas; debe ser > 0 cuando se provee",
    )
    categories: list[str] | None = None
    thumbnail_url: str | None = None
    language: str | None = Field(default=None, description="Código de idioma (ej. 'es', 'en')")

    @field_validator("isbn", mode="before")
    @classmethod
    def _normalize_isbn(cls, value: str | None) -> str | None:
        """Normaliza el ISBN (guiones/espacios → 13 dígitos) antes de validar."""
        return normalize_isbn13(value)
