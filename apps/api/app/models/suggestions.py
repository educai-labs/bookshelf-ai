"""Modelos Pydantic de sugerencias de búsqueda (feature 023).

Contrato del endpoint `GET /api/v1/books/suggestions`:

- `SuggestionSource`: origen de una sugerencia (`library` = libro del usuario,
  `catalog` = catálogo externo Open Library/Google Books).
- `BookSuggestion`: forma normalizada de una sugerencia, con `book_id` nullable
  (presente solo en las de biblioteca) e `isbn13` como llave maestra.
- `SuggestionsRequest`: query params (`q` obligatorio tras trim, `limit` con
  clamp 1-20).
- `SuggestionsResponse`: respuesta final (lista ya mergeada y deduplicada).

Validación de `limit` entre 1 y 20 (spec): en lugar de rechazar valores fuera
de rango, se aplica un *clamp* (`max(1, min(20, limit))`), de modo que `limit=0`
→ 1 y `limit=100` → 20. La validación de `q` (obligatorio y no vacío tras trim)
produce 422 `VALIDATION_ERROR` vía el handler global de `RequestValidationError`.
"""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

# Origen de una sugerencia (fuentes del merge biblioteca + catálogo).
SuggestionSource = Literal["library", "catalog"]

DEFAULT_SUGGESTION_LIMIT = 8
MIN_SUGGESTION_LIMIT = 1
MAX_SUGGESTION_LIMIT = 20


class BookSuggestion(BaseModel):
    """Una sugerencia normalizada, lista para renderizar en el dropdown."""

    model_config = ConfigDict(extra="ignore")

    source: SuggestionSource
    # Solo presente en sugerencias de biblioteca (UUID de `books.id`); None en catálogo.
    book_id: UUID | None = None
    isbn13: str = Field(pattern=r"^\d{13}$")
    title: str
    authors: list[str] = Field(default_factory=list)
    cover_url: str | None = None
    # True para biblioteca; False para catálogo (los duplicados ya se deduplican).
    in_library: bool


class SuggestionsRequest(BaseModel):
    """Query params de `GET /api/v1/books/suggestions`."""

    model_config = ConfigDict(extra="ignore")

    q: str
    limit: int = Field(default=DEFAULT_SUGGESTION_LIMIT)

    @field_validator("q", mode="before")
    @classmethod
    def _trim_q(cls, value: object) -> object:
        """Normaliza `q`: quita espacios/guiones de borde (no modifica el interior)."""
        if isinstance(value, str):
            return value.strip()
        return value

    @field_validator("q")
    @classmethod
    def _q_no_vacio(cls, value: str) -> str:
        if not value:
            raise ValueError("El parámetro q no puede estar vacío")
        return value

    @field_validator("limit")
    @classmethod
    def _clamp_limit(cls, value: int) -> int:
        return max(MIN_SUGGESTION_LIMIT, min(MAX_SUGGESTION_LIMIT, value))


class SuggestionsResponse(BaseModel):
    """Respuesta de sugerencias: consulta normalizada + lista mergeada."""

    model_config = ConfigDict(extra="ignore")

    query: str
    limit: int
    items: list[BookSuggestion] = Field(default_factory=list)
