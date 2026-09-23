"""`ISBNLookupService` (feature 008, fallback search.json feature 025).

Servicio de dominio puro que orquesta la búsqueda de metadatos por ISBN-13:

1. Normaliza y valida el ISBN (`normalizar_isbn` → `InvalidISBNError`).
2. Consulta la caché en memoria (TTL 1 hora; se verifica en cada `get`).
3. Consulta Open Library `/api/books` (fuente primaria); si no devuelve
   metadatos completos (título, autores, portada) consulta Open Library
   `search.json?q=isbn:<isbn>` (feature 025, misma fuente que el typeahead 023)
   y, si sigue sin completarse, hace fallback a Google Books (con API key
   opcional de `settings.google_books_api_key`).
4. Si las tres fuentes fallan (sin datos o error de red/timeout agotados),
   lanza `ISBNNotFoundError`.

El cliente HTTP (`httpx.AsyncClient`, timeout 5s, 2 reintentos con backoff
exponencial 1s→2s ante timeouts/errores de red) se inyecta por constructor
para poder mockearlo en tests.
"""

import asyncio
import json
import re
import time
from typing import Any

import httpx

from app.core.config import settings
from app.core.logging import get_logger
from app.models.isbn import (
    CatalogSearchResult,
    ISBNLookupResponse,
    ISBNNotFoundError,
    normalizar_isbn,
)

logger = get_logger(__name__)

OPEN_LIBRARY_URL = "https://openlibrary.org/api/books"
GOOGLE_BOOKS_URL = "https://www.googleapis.com/books/v1/volumes"
OPEN_LIBRARY_SEARCH_URL = "https://openlibrary.org/search.json"

CACHE_TTL_SECONDS = 3600  # TTL 1 hora (MVP en memoria; Redis = feature 020)
HTTP_TIMEOUT = 5.0
RETRY_DELAYS = (1.0, 2.0)  # backoff exponencial: 1s → 2s

# Búsqueda textual (typeahead, feature 023): timeout estricto y SIN reintentos.
SEARCH_TIMEOUT_SECONDS = 2.0
SEARCH_CACHE_TTL_SECONDS = 3600  # TTL 1 hora (mismo patrón que el lookup ISBN)


class ISBNLookupService:
    """Orquesta la búsqueda de metadatos de un libro por ISBN-13.

    Además del lookup por ISBN (`buscar`), expone la búsqueda textual
    (`buscar_texto`) usada por el typeahead (feature 023): Open Library
    primario / Google Books fallback, timeout de 2 s sin reintentos y caché en
    memoria por consulta normalizada con TTL de 1 hora.
    """

    def __init__(
        self,
        client: httpx.AsyncClient | None = None,
        retry_delays: tuple[float, float] = RETRY_DELAYS,
    ) -> None:
        self._client = client if client is not None else httpx.AsyncClient(timeout=HTTP_TIMEOUT)
        self._retry_delays = retry_delays
        self._cache: dict[str, tuple[ISBNLookupResponse, float]] = {}
        self._search_cache: dict[str, tuple[list[CatalogSearchResult], float]] = {}

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

    # ------------------------------------------------------- Búsqueda textual

    async def buscar_texto(self, query: str, limit: int = 8) -> list[CatalogSearchResult]:
        """Búsqueda textual: caché → Open Library → Google Books (fallback).

        A diferencia de `buscar(isbn)`, esta operación es *fail-soft*: si ambas
        fuentes fallan o no devuelven resultados con ISBN-13 resoluble, devuelve
        lista vacía (nunca lanza `ISBNNotFoundError`). Timeout de 2 s por fuente
        y cero reintentos (el typeahead no puede bloquearse).
        """
        query = self._normalizar_query(query)
        if not query:
            return []

        key = f"text:{query}:{limit}"
        cached = self._get_cached_search(key)
        if cached is not None:
            return cached

        results = await self._buscar_texto_en_fuentes(query, limit)
        self._search_cache[key] = (results, time.monotonic())
        return results

    @staticmethod
    def _normalizar_query(query: str) -> str:
        """Normaliza la consulta para la caché: trim + minúsculas."""
        return query.strip().lower()

    def _get_cached_search(self, key: str) -> list[CatalogSearchResult] | None:
        """Devuelve la entrada de caché de búsqueda si no ha expirado (TTL 1h)."""
        entry = self._search_cache.get(key)
        if entry is None:
            return None
        results, timestamp = entry
        if time.monotonic() - timestamp < SEARCH_CACHE_TTL_SECONDS:
            return results
        del self._search_cache[key]
        return None

    async def _buscar_texto_en_fuentes(self, query: str, limit: int) -> list[CatalogSearchResult]:
        """Open Library primero; Google Books como fallback.

        Ambos fallos (sin resultados con ISBN-13 o error de red/timeout) se
        traducen en lista vacía (fail-soft), sin excepciones hacia el caller.
        """
        try:
            raw = await self._fetch_openlibrary_search(query, limit)
        except (httpx.TimeoutException, httpx.NetworkError):
            raw = None
        if raw is not None:
            mapped = self._map_openlibrary_search(raw)
            if mapped:
                return mapped[:limit]

        try:
            raw = await self._fetch_googlebooks_search(query, limit)
        except (httpx.TimeoutException, httpx.NetworkError):
            raw = None
        if raw is not None:
            mapped = self._map_googlebooks_search(raw)
            if mapped:
                return mapped[:limit]

        return []

    async def _fetch_openlibrary_search(
        self, query: str, limit: int
    ) -> list[dict[str, Any]] | None:
        """Consulta `openlibrary.org/search.json`; devuelve `docs` o `None`."""
        params = {
            "q": query,
            "fields": "title,author_name,isbn,cover_i",
            "limit": str(limit),
        }
        payload = await self._get_json_search(OPEN_LIBRARY_SEARCH_URL, params)
        if not isinstance(payload, dict):
            return None
        docs = payload.get("docs")
        return docs if isinstance(docs, list) else None

    async def _fetch_googlebooks_search(
        self, query: str, limit: int
    ) -> list[dict[str, Any]] | None:
        """Consulta Google Books (`q` libre); devuelve `items` o `None`."""
        params: dict[str, str] = {"q": query, "maxResults": str(min(limit, 40))}
        if settings.google_books_api_key:
            params["key"] = settings.google_books_api_key
        payload = await self._get_json_search(GOOGLE_BOOKS_URL, params)
        if not isinstance(payload, dict):
            return None
        items = payload.get("items")
        return items if isinstance(items, list) else None

    async def _get_json_search(self, url: str, params: dict[str, str]) -> Any | None:
        """GET de búsqueda con timeout de 2 s y **sin reintentos**.

        - `HTTPStatusError` (4xx/5xx) → `None` (sin datos utilizables).
        - `TimeoutException`/`NetworkError` → se propaga al caller (que decide
          el fallback/fail-soft). Nunca se reintenta.
        """
        try:
            response = await self._client.get(
                url,
                params=params,
                timeout=httpx.Timeout(SEARCH_TIMEOUT_SECONDS),
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError:
            return None

    @staticmethod
    def _map_openlibrary_search(docs: list[dict[str, Any]]) -> list[CatalogSearchResult]:
        """Mapea `docs` de Open Library a resultados, descartando sin ISBN-13."""
        results: list[CatalogSearchResult] = []
        for doc in docs:
            if not isinstance(doc, dict):
                continue
            isbn13 = _resolver_isbn13(doc.get("isbn"))
            title = (doc.get("title") or "").strip()
            if isbn13 is None or not title:
                continue
            cover_i = doc.get("cover_i")
            results.append(
                CatalogSearchResult(
                    isbn13=isbn13,
                    title=title,
                    authors=[a for a in (doc.get("author_name") or []) if isinstance(a, str)],
                    cover_url=(
                        f"https://covers.openlibrary.org/b/id/{cover_i}-M.jpg" if cover_i else None
                    ),
                )
            )
        return results

    @staticmethod
    def _map_googlebooks_search(items: list[dict[str, Any]]) -> list[CatalogSearchResult]:
        """Mapea `items` de Google Books a resultados, descartando sin ISBN-13."""
        results: list[CatalogSearchResult] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            volume = item.get("volumeInfo")
            if not isinstance(volume, dict):
                continue
            identifiers = volume.get("industryIdentifiers") or []
            codigos = [
                identifier.get("identifier")
                for identifier in identifiers
                if isinstance(identifier, dict) and identifier.get("identifier")
            ]
            isbn13 = _resolver_isbn13(codigos)
            title = (volume.get("title") or "").strip()
            if isbn13 is None or not title:
                continue
            image_links = volume.get("imageLinks") or {}
            results.append(
                CatalogSearchResult(
                    isbn13=isbn13,
                    title=title,
                    authors=[a for a in (volume.get("authors") or []) if isinstance(a, str)],
                    cover_url=image_links.get("thumbnail"),
                )
            )
        return results

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
        """Open Library `/api/books` → `search.json` → Google Books.

        Cada fallo (sin datos completos O error de red/timeout agotado) se
        acumula en `errores` y, si las tres fuentes fallan, se traduce en
        `ISBNNotFoundError` con mensaje descriptivo que las menciona en orden.
        """
        errores: list[str] = []

        try:
            raw = await self._fetch_openlibrary(isbn)
        except (httpx.TimeoutException, httpx.NetworkError) as exc:
            errores.append(f"Open Library /api/books: {exc.__class__.__name__}")
            raw = None
        if raw is not None:
            mapped = self._map_openlibrary(isbn, raw)
            if self._es_completo(mapped):
                return mapped
            errores.append("Open Library /api/books no devolvió metadatos completos")
        else:
            errores.append("Open Library /api/books no devolvió datos")

        try:
            docs = await self._fetch_openlibrary_search_isbn(isbn)
        except (httpx.TimeoutException, httpx.NetworkError) as exc:
            logger.warning(
                "openlibrary_search_failed",
                error=exc.__class__.__name__,
                isbn=isbn,
            )
            errores.append(f"Open Library search.json: {exc.__class__.__name__}")
            docs = None
        if docs is not None:
            mapped = self._map_openlibrary_search_isbn(isbn, docs)
            if mapped is not None and self._es_completo(mapped):
                return mapped
            errores.append("Open Library search.json no devolvió metadatos completos")
        else:
            errores.append("Open Library search.json no devolvió datos")

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

    async def _fetch_openlibrary_search_isbn(self, isbn: str) -> list[dict[str, Any]] | None:
        """Consulta `openlibrary.org/search.json?q=isbn:<isbn>`; devuelve `docs` o `None`.

        Reutiliza `_get_json` (timeout 5 s, 2 reintentos con backoff 1 s → 2 s):
        - respuestas 4xx/5xx y JSON sin `docs` → `None` (fuente sin datos);
        - timeouts/errores de red agotados → se propagan al caller, que registra
          el error y continúa con Google Books.
        """
        params = {
            "q": f"isbn:{isbn}",
            "fields": "title,author_name,isbn,cover_i,first_publish_year",
        }
        payload = await self._get_json(OPEN_LIBRARY_SEARCH_URL, params)
        if not isinstance(payload, dict):
            return None
        docs = payload.get("docs")
        return docs if isinstance(docs, list) else None

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
        - `json.JSONDecodeError`: cuerpo no parseable → `None` (fuente sin datos).
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
            except json.JSONDecodeError:
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
    def _map_openlibrary_search_isbn(
        isbn: str, docs: list[dict[str, Any]]
    ) -> ISBNLookupResponse | None:
        """Mapea el doc de `search.json` cuyo `isbn` coincide con el ISBN solicitado.

        Solo se acepta un documento cuyo array `isbn` contenga el ISBN-13
        normalizado buscado (con equivalencia ISBN-10 → ISBN-13); si ningún doc
        lo contiene, devuelve `None` y el flujo continúa a Google Books.

        - `title` ← `title`; `authors` ← `author_name`
        - `cover_url` ← `https://covers.openlibrary.org/b/id/<cover_i>-M.jpg`
          (`None` si no hay `cover_i`)
        - `published_date` ← `str(first_publish_year)` (`None` si no viene)
        - `description`, `page_count`, `publisher` quedan en `None` (search.json
          no los aporta).
        """
        for doc in docs:
            if not isinstance(doc, dict):
                continue
            if not _isbn13_en_identificadores(doc.get("isbn"), isbn):
                continue
            cover_i = doc.get("cover_i")
            first_publish_year = doc.get("first_publish_year")
            return ISBNLookupResponse(
                title=(doc.get("title") or "").strip(),
                authors=[
                    author for author in (doc.get("author_name") or []) if isinstance(author, str)
                ],
                cover_url=(
                    f"https://covers.openlibrary.org/b/id/{cover_i}-M.jpg" if cover_i else None
                ),
                published_date=str(first_publish_year) if first_publish_year else None,
            )
        return None

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
# Resolución de ISBN-13 desde identificadores mixtos (feature 023)
# ---------------------------------------------------------------------------


def isbn10_a_isbn13(isbn10: str) -> str | None:
    """Convierte un ISBN-10 a ISBN-13 (prefijo 978 + recálculo del dígito de control).

    Devuelve `None` si la entrada no es un ISBN-10 válido (10 caracteres,
    con 'X' permitido como último dígito de control).
    """
    limpio = re.sub(r"[^0-9Xx]", "", str(isbn10)).upper()
    if len(limpio) != 10:
        return None
    base = "978" + limpio[:9]
    total = 0
    for index, char in enumerate(base):
        total += int(char) * (1 if index % 2 == 0 else 3)
    check = (10 - total % 10) % 10
    return base + str(check)


def _isbn13_en_identificadores(codigos: Any, isbn: str) -> bool:
    """True si `isbn` (ISBN-13) está presente en `codigos` (con ISBN-10 → 13).

    `search.json` puede devolver el identificador buscado como ISBN-13 o como
    ISBN-10; ambos se aceptan (equivalencia vía `_resolver_isbn13`).
    """
    for raw in codigos or []:
        if not isinstance(raw, str):
            continue
        if _resolver_isbn13([raw]) == isbn:
            return True
    return False


def _resolver_isbn13(codigos: Any) -> str | None:
    """Resuelve un ISBN-13 desde una lista de identificadores mixtos.

    Acepta entradas de 13 dígitos tal cual, e ISBN-10 que se convierten a
    ISBN-13. Devuelve `None` si ningún identificador es resoluble (la llave
    maestra del alta requiere ISBN-13).
    """
    for raw in codigos or []:
        if not isinstance(raw, str):
            continue
        limpio = re.sub(r"[\s-]", "", raw).upper()
        if len(limpio) == 13 and limpio.isdigit():
            return limpio
        if len(limpio) == 10:
            convertido = isbn10_a_isbn13(limpio)
            if convertido is not None:
                return convertido
    return None


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
