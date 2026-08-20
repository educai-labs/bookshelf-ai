"""`ISBNLookupService` (feature 008).

Servicio de dominio puro que orquesta la búsqueda de metadatos por ISBN-13:

1. Normaliza y valida el ISBN (`normalizar_isbn` → `InvalidISBNError`).
2. Consulta la caché en memoria (TTL 1 hora; se verifica en cada `get`).
3. Consulta Open Library (fuente primaria); si no devuelve metadatos completos
   (título, autores, portada) hace fallback a Google Books (con API key
   opcional de `settings.google_books_api_key`).
4. Si ambas fuentes fallan (sin datos o error de red/timeout agotados), lanza
   `ISBNNotFoundError`.

El cliente HTTP (`httpx.AsyncClient`, timeout 5s, 2 reintentos con backoff
exponencial 1s→2s ante timeouts/errores de red) se inyecta por constructor
para poder mockearlo en tests.
"""

import asyncio
import time
from typing import Any

import httpx

from app.core.config import settings
from app.models.isbn import (
    ISBNLookupResponse,
    ISBNNotFoundError,
    normalizar_isbn,
)

OPEN_LIBRARY_URL = "https://openlibrary.org/api/books"
GOOGLE_BOOKS_URL = "https://www.googleapis.com/books/v1/volumes"

CACHE_TTL_SECONDS = 3600  # TTL 1 hora (MVP en memoria; Redis = feature 020)
HTTP_TIMEOUT = 5.0
RETRY_DELAYS = (1.0, 2.0)  # backoff exponencial: 1s → 2s


class ISBNLookupService:
    """Orquesta la búsqueda de metadatos de un libro por ISBN-13."""

    def __init__(
        self,
        client: httpx.AsyncClient | None = None,
        retry_delays: tuple[float, float] = RETRY_DELAYS,
    ) -> None:
        self._client = client if client is not None else httpx.AsyncClient(timeout=HTTP_TIMEOUT)
        self._retry_delays = retry_delays
        self._cache: dict[str, tuple[ISBNLookupResponse, float]] = {}

    # ------------------------------------------------------------------ API

    def normalizar_isbn(self, isbn: str) -> str:
        """Normaliza y valida un ISBN-13; lanza `InvalidISBNError` si no es válido."""
        return normalizar_isbn(isbn)

    async def buscar(self, isbn: str) -> ISBNLookupResponse:
        """Busca metadatos por ISBN-13: caché → Open Library → Google Books.

        Levanta `InvalidISBNError` si el ISBN no es válido y `ISBNNotFoundError`
        si ninguna fuente devuelve metadatos completos.
        """
        isbn = self.normalizar_isbn(isbn)

        cached = self._get_cached(isbn)
        if cached is not None:
            return cached

        result = await self._buscar_en_fuentes(isbn)
        self._cache[isbn] = (result, time.monotonic())
        return result

    # ----------------------------------------------------------------- Caché

    def _get_cached(self, isbn: str) -> ISBNLookupResponse | None:
        """Devuelve la entrada de caché si no ha expirado (TTL 1h)."""
        entry = self._cache.get(isbn)
        if entry is None:
            return None
        result, timestamp = entry
        if time.monotonic() - timestamp < CACHE_TTL_SECONDS:
            return result
        # TTL expirado: limpieza perezosa (solo al leer).
        del self._cache[isbn]
        return None

    # -------------------------------------------------------------- Fuentes

    async def _buscar_en_fuentes(self, isbn: str) -> ISBNLookupResponse:
        """Open Library primero; Google Books como fallback.

        Ambos fallos (sin datos completos O error de red/timeout agotado) se
        traducen en `ISBNNotFoundError` con mensaje descriptivo (criterio spec).
        """
        errores: list[str] = []

        try:
            raw = await self._fetch_openlibrary(isbn)
        except (httpx.TimeoutException, httpx.NetworkError) as exc:
            errores.append(f"Open Library: {exc.__class__.__name__}")
            raw = None
        if raw is not None:
            mapped = self._map_openlibrary(isbn, raw)
            if self._es_completo(mapped):
                return mapped
            errores.append("Open Library no devolvió metadatos completos")
        else:
            errores.append("Open Library no devolvió datos")

        try:
            raw = await self._fetch_googlebooks(isbn)
        except (httpx.TimeoutException, httpx.NetworkError) as exc:
            errores.append(f"Google Books: {exc.__class__.__name__}")
            raw = None
        if raw is not None:
            mapped = self._map_googlebooks(isbn, raw)
            if self._es_completo(mapped):
                return mapped
            errores.append("Google Books no devolvió metadatos completos")
        else:
            errores.append("Google Books no devolvió datos")

        raise ISBNNotFoundError(
            isbn,
            f"No se encontró el libro con ISBN {isbn}: {'; '.join(errores)}",
        )

    async def _fetch_openlibrary(self, isbn: str) -> dict[str, Any] | None:
        """Consulta la API de Open Library. Devuelve el volumen del libro o `None`."""
        params = {"bibkeys": f"ISBN:{isbn}", "format": "json", "jscmd": "data"}
        payload = await self._get_json(OPEN_LIBRARY_URL, params)
        if not isinstance(payload, dict):
            return None
        return payload.get(f"ISBN:{isbn}")

    async def _fetch_googlebooks(self, isbn: str) -> dict[str, Any] | None:
        """Consulta la API de Google Books. Devuelve el primer `volumeInfo` o `None`."""
        params: dict[str, str] = {"q": f"isbn:{isbn}"}
        if settings.google_books_api_key:
            params["key"] = settings.google_books_api_key
        payload = await self._get_json(GOOGLE_BOOKS_URL, params)
        if not isinstance(payload, dict):
            return None
        items = payload.get("items") or []
        if not items:
            return None
        return items[0].get("volumeInfo")

    async def _get_json(self, url: str, params: dict[str, str]) -> Any | None:
        """GET con timeout y 2 reintentos (backoff exponencial 1s→2s).

        - `HTTPStatusError` (4xx/5xx): respuesta de la API sin datos utilizables
          → devuelve `None` (no se reintenta).
        - `TimeoutException`/`NetworkError`: se reintenta hasta 2 veces; si se
          agotan, se propaga el último error.
        """
        errores: list[httpx.HTTPError] = []
        for delay in (0.0, *self._retry_delays):
            try:
                response = await self._client.get(url, params=params)
                response.raise_for_status()
                return response.json()
            except httpx.HTTPStatusError:
                return None
            except (httpx.TimeoutException, httpx.NetworkError) as exc:
                errores.append(exc)
                if delay:
                    await asyncio.sleep(delay)
        if errores:
            raise errores[-1]
        return None

    # ---------------------------------------------------------------- Mapeo

    @staticmethod
    def _map_openlibrary(isbn: str, data: dict[str, Any]) -> ISBNLookupResponse:
        """Mapea el esquema de Open Library a `ISBNLookupResponse`."""
        cover = data.get("cover") or {}
        publishers = data.get("publishers") or []
        description = data.get("description")
        if isinstance(description, dict):  # {"value": "...", "type": "/type/text"}
            description = description.get("value")
        return ISBNLookupResponse(
            title=data.get("title") or "",
            authors=[
                author.get("name", "")
                for author in (data.get("authors") or [])
                if author.get("name")
            ],
            cover_url=cover.get("small") or cover.get("medium") or cover.get("large"),
            page_count=data.get("number_of_pages"),
            publisher=publishers[0].get("name") if publishers else None,
            published_date=data.get("publish_date"),
            description=description,
        )

    @staticmethod
    def _map_googlebooks(isbn: str, data: dict[str, Any]) -> ISBNLookupResponse:
        """Mapea el esquema de Google Books (`volumeInfo`) a `ISBNLookupResponse`."""
        image_links = data.get("imageLinks") or {}
        return ISBNLookupResponse(
            title=data.get("title") or "",
            authors=[author for author in (data.get("authors") or []) if isinstance(author, str)],
            cover_url=image_links.get("thumbnail"),
            page_count=data.get("pageCount"),
            publisher=data.get("publisher"),
            published_date=data.get("publishedDate"),
            description=data.get("description"),
        )

    @staticmethod
    def _es_completo(respuesta: ISBNLookupResponse) -> bool:
        """True si la respuesta tiene título, autores y portada.

        Criterio de la spec: Open Library es fuente primaria; Google Books es
        fallback cuando Open Library no devuelve datos completos (sin título,
        sin autores, sin portada).
        """
        return bool(respuesta.title and respuesta.authors and respuesta.cover_url)


# ---------------------------------------------------------------------------
# Singleton para inyección vía `Depends(get_lookup_service)`
# ---------------------------------------------------------------------------

_service: ISBNLookupService | None = None


def get_lookup_service() -> ISBNLookupService:
    """Dependency: `ISBNLookupService` compartido (singleton por proceso).

    Los tests la sustituyen con `app.dependency_overrides` para inyectar un
    servicio con cliente mockeado.
    """
    global _service
    if _service is None:
        _service = ISBNLookupService()
    return _service
