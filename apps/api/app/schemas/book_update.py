"""Modelo de actualización parcial de libro (feature 007, PATCH /books/{id})."""

from datetime import date
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.book_metadata import normalize_isbn13
from app.schemas.enums import BookStatus


class BookUpdate(BaseModel):
    """Payload de `PATCH /books/{id}`: PATCH parcial con todos los campos opcionales.

    Campos de `BookMetadata` (todos `Optional`) + `status`, `rating` (1-5) y
    `review`. Un campo omitido no se modifica; `null` explícito borra el valor.
    """

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
        use_enum_values=True,
    )

    isbn: str | None = None
    title: str | None = None
    authors: list[str] | None = None
    publisher: str | None = None
    published_date: date | None = None
    description: str | None = None
    page_count: int | None = Field(default=None, gt=0)
    categories: list[str] | None = None
    thumbnail_url: str | None = None
    language: str | None = None
    status: BookStatus | None = None
    rating: Annotated[int | None, Field(ge=1, le=5)] = None
    review: str | None = None

    @field_validator("isbn", mode="before")
    @classmethod
    def _normalize_isbn(cls, value: str | None) -> str | None:
        """Normaliza el ISBN (guiones/espacios → 13 dígitos) antes de validar."""
        return normalize_isbn13(value)
