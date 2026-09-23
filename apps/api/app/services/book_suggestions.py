"""Servicio de sugerencias de búsqueda (feature 023).

Orquesta el merge biblioteca + catálogo para el endpoint
`GET /api/v1/books/suggestions`:

1. **Biblioteca del usuario** (siempre): consulta `books` filtrada por
   `user_id` (derivado del JWT, nunca aceptado del cliente), con coincidencia
   `ilike` sobre `title` e `isbn13` y por autor en Python (PostgREST no soporta
   `ilike` sobre `text[]` — mismo criterio que la feature 009).
2. **Catálogo externo** (solo si `len(q) >= 3`): delega en
   `ISBNLookupService.buscar_texto()` (Open Library primario / Google Books
   fallback, timeout 2 s sin reintentos, caché 1 h).
3. **Merge**: biblioteca primero, catálogo rellena hasta `limit`, deduplicación
   por ISBN-13 (gana la entrada de biblioteca) y truncado al `limit` solicitado.

Fail-soft: cualquier error/timeout del catálogo externo se registra y se
convierte en una lista vacía de catálogo — el endpoint devuelve 200 con solo
biblioteca, nunca un error duro.
"""

from typing import Any

from supabase import Client

from app.core.logging import get_logger
from app.models.suggestions import BookSuggestion, SuggestionsResponse
from app.services.isbn_lookup import ISBNLookupService

logger = get_logger(__name__)

# Umbral de caracteres: por debajo no se consulta el catálogo externo.
MIN_CHARS_FOR_CATALOG = 3


class BookSuggestionsService:
    """Merge de sugerencias de biblioteca + catálogo para el typeahead."""

    def __init__(self, lookup_service: ISBNLookupService) -> None:
        self._lookup = lookup_service

    async def get_suggestions(
        self,
        supabase: Client,
        user_id: str,
        q: str,
        limit: int,
    ) -> SuggestionsResponse:
        """Devuelve las sugerencias mergeadas para `q` (ya normalizado)."""
        library = self._buscar_biblioteca(supabase, user_id, q, limit)

        if len(q) < MIN_CHARS_FOR_CATALOG:
            return SuggestionsResponse(query=q, limit=limit, items=library)

        catalog = await self._buscar_catalogo(q, limit)
        library_isbns = {suggestion.isbn13 for suggestion in library}
        merged = self._merge(library, catalog, limit, library_isbns)
        return SuggestionsResponse(query=q, limit=limit, items=merged)

    # ----------------------------------------------------------------- Biblioteca

    def _buscar_biblioteca(
        self, supabase: Client, user_id: str, q: str, limit: int
    ) -> list[BookSuggestion]:
        """Sugerencias de biblioteca: `title`/`isbn13` ILIKE y autores en Python."""
        pattern = f"%{q}%"
        q_lower = q.lower()
        base = supabase.table("books")

        title_ids = [
            row["id"]
            for row in (
                base.select("id").eq("user_id", user_id).ilike("title", pattern).execute().data
                or []
            )
        ]
        isbn_ids = [
            row["id"]
            for row in (
                base.select("id").eq("user_id", user_id).ilike("isbn13", pattern).execute().data
                or []
            )
        ]
        author_rows = base.select("id, authors").eq("user_id", user_id).execute().data or []
        author_ids = [
            row["id"]
            for row in author_rows
            if any(q_lower in (author or "").lower() for author in (row.get("authors") or []))
        ]

        ids = list(dict.fromkeys([*title_ids, *isbn_ids, *author_ids]))
        if not ids:
            return []

        rows = (
            base.select("id, isbn13, title, authors, cover_url")
            .eq("user_id", user_id)
            .in_("id", ids)
            .execute()
            .data
            or []
        )
        suggestions = [self._to_library_suggestion(row) for row in rows]
        # Orden estable: por título (case-insensitive).
        suggestions.sort(key=lambda s: s.title.lower())
        return suggestions[:limit]

    @staticmethod
    def _to_library_suggestion(row: dict[str, Any]) -> BookSuggestion:
        return BookSuggestion(
            source="library",
            book_id=row["id"],
            isbn13=str(row.get("isbn13") or "").strip(),
            title=row["title"],
            authors=list(row.get("authors") or []),
            cover_url=row.get("cover_url"),
            in_library=True,
        )

    # ----------------------------------------------------------------- Catálogo

    async def _buscar_catalogo(self, q: str, limit: int) -> list[BookSuggestion]:
        """Sugerencias de catálogo; fail-soft ([] ante cualquier error)."""
        try:
            results = await self._lookup.buscar_texto(q, limit)
        except Exception as exc:  # noqa: BLE001 — fail-soft: nunca romper el typeahead
            logger.error("catalog_search_failed", error=str(exc), query=q)
            return []
        return [
            BookSuggestion(
                source="catalog",
                book_id=None,
                isbn13=result.isbn13,
                title=result.title,
                authors=result.authors,
                cover_url=result.cover_url,
                in_library=False,
            )
            for result in results
        ]

    # -------------------------------------------------------------------- Merge

    @staticmethod
    def _merge(
        library: list[BookSuggestion],
        catalog: list[BookSuggestion],
        limit: int,
        library_isbns: set[str],
    ) -> list[BookSuggestion]:
        """Biblioteca primero, catálogo rellena, dedup por ISBN-13, truncado a `limit`."""
        seen: set[str] = set()
        merged: list[BookSuggestion] = []

        for suggestion in library:
            if suggestion.isbn13 in seen:
                continue
            seen.add(suggestion.isbn13)
            merged.append(suggestion)

        for suggestion in catalog:
            if suggestion.isbn13 in seen or suggestion.isbn13 in library_isbns:
                continue
            seen.add(suggestion.isbn13)
            merged.append(suggestion)

        return merged[:limit]
