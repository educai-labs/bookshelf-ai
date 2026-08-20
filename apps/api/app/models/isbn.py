"""Modelos Pydantic del servicio de ISBN lookup (feature 008).

- `ISBNRequest`: valida el query param `isbn` del endpoint
  `GET /api/v1/books/lookup` (normaliza guiones/espacios → 13 dígitos).
- `ISBNLookupResponse`: metadatos normalizados de un libro, unificando los
  esquemas de Open Library y Google Books.
- `InvalidISBNError` / `ISBNNotFoundError`: excepciones de dominio con
  `code`/`message` (convención `detail={code, message}` del tech-stack).
"""

import re

from pydantic import BaseModel, ConfigDict, Field, field_validator

# ISBN-13 tal y como se almacena en DB (columna `books.isbn13`, CHECK regex).
ISBN13_PATTERN = re.compile(r"^\d{13}$")


class InvalidISBNError(Exception):
    """ISBN no válido: tras normalizar (quitar guiones/espacios) no son 13 dígitos."""

    code = "INVALID_ISBN"

    def __init__(self, isbn: str) -> None:
        self.isbn = isbn
        self.message = (
            f"El ISBN '{isbn}' no es válido: debe tener exactamente 13 dígitos "
            "(se ignoran guiones y espacios)"
        )
        super().__init__(self.message)


class ISBNNotFoundError(Exception):
    """Ninguna fuente (Open Library ni Google Books) devolvió metadatos completos."""

    code = "ISBN_NOT_FOUND"

    def __init__(self, isbn: str, detail: str | None = None) -> None:
        self.isbn = isbn
        self.message = detail or f"No se encontró ningún libro con el ISBN {isbn}"
        super().__init__(self.message)


def normalizar_isbn(isbn: str) -> str:
    """Normaliza un ISBN-13: quita guiones/espacios y valida que sean 13 dígitos.

    Lanza `InvalidISBNError` si la entrada no es un ISBN-13 válido.
    """
    normalized = re.sub(r"[\s-]", "", str(isbn)).strip()
    if not ISBN13_PATTERN.fullmatch(normalized):
        raise InvalidISBNError(isbn)
    return normalized


class ISBNRequest(BaseModel):
    """Query param del endpoint lookup: `?isbn=...`.

    `isbn` se normaliza (guiones/espacios → 13 dígitos) antes de validar;
    si no es un ISBN-13 válido se lanza `InvalidISBNError`.
    """

    isbn: str = Field(description="ISBN-13 del libro a buscar")

    @field_validator("isbn", mode="before")
    @classmethod
    def _normalizar_y_validar(cls, value: str) -> str:
        return normalizar_isbn(value)


class ISBNLookupResponse(BaseModel):
    """Metadatos normalizados de un libro devueltos por el endpoint lookup.

    `published_date` se conserva como string porque cada API lo devuelve con
    formatos variados ("2001", "2001-03-01", "March 2001"); la conversión a
    `date` se hará en el alta del libro (feature 009).
    """

    model_config = ConfigDict(extra="ignore")

    title: str
    authors: list[str] = Field(default_factory=list)
    cover_url: str | None = None
    page_count: int | None = None
    publisher: str | None = None
    published_date: str | None = None
    description: str | None = None
