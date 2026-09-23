"""Modelos y errores del servicio de ISBN lookup (feature 008).

- `ISBNLookupResponse`: metadatos normalizados de un libro, unificando los
  esquemas de Open Library y Google Books.
- `InvalidISBNError` / `ISBNNotFoundError`: excepciones de dominio con
  `code`/`message` (convención `detail={code, message}` del tech-stack).
- `normalizar_isbn`: normaliza y valida un ISBN-13.
"""

import re

from pydantic import BaseModel, ConfigDict, Field

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


class CatalogSearchResult(BaseModel):
    """Resultado normalizado de la búsqueda textual (feature 023).

    A diferencia de `ISBNLookupResponse` (metadatos completos por ISBN), este
    modelo es el mínimo que necesita el typeahead: ISBN-13 resuelto + título
    (+ autores y portada opcionales). Solo se devuelven resultados cuyo ISBN-13
    se puede resolver (llave maestra del alta).
    """

    model_config = ConfigDict(extra="ignore")

    isbn13: str = Field(pattern=r"^\d{13}$")
    title: str
    authors: list[str] = Field(default_factory=list)
    cover_url: str | None = None
