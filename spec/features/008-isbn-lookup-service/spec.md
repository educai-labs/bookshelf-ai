# 008 · ISBN Lookup Service

**Estado:** propuesta

## Qué hace

Implementa `ISBNLookupService` en `apps/api/app/services/isbn_lookup.py` que resuelve metadatos de libro dado un ISBN-13.

Flujo:
1. Normaliza ISBN (quita guiones/espacios, valida 13 dígitos).
2. Intenta **Open Library API** (`https://openlibrary.org/api/books?bibkeys=ISBN:{isbn}&format=json&jscmd=data`) — sin API key, rate limit ~100 req/min.
3. Si Open Library falla (timeout, 404, datos incompletos: sin título/autores/portada), cae a **Google Books API** (`https://www.googleapis.com/books/v1/volumes?q=isbn:{isbn}`) — requiere `GOOGLE_BOOKS_API_KEY` opcional para cuota mayor.
4. Normaliza respuesta a `BookMetadata` (campos mapeados: title, authors[], cover_url (thumbnail L), page_count, publisher, published_date, description).
5. Cache en memoria (TTL 1 hora, `cachetools.TTLCache`) para evitar re-lookups.
6. Manejo de errores: timeout 5s (httpx), retry 2x con backoff exponencial, logging estructurado.

Endpoint expuesto: `GET /api/v1/books/lookup?isbn=978...` → `BookMetadata` (feature 009).

## Por qué

ISBN es la llave maestra de alta de libros (decisión confirmada). Open Library es gratis y sin key; Google Books es fallback robusto. Cache evita rate limits y acelera UX (lookup instantáneo en reintentos). Normalización a `BookMetadata` desacopla consumidores de APIs externas.

## Criterios de aceptación

- [ ] Clase `ISBNLookupService` con método `async lookup(isbn: str) -> BookMetadata`.
- [ ] Normalización ISBN: `"978-84-9759-231-1"` → `"9788497592311"`; rechaza si no 13 dígitos.
- [ ] Open Library primario: parsea `title`, `authors[].name`, `cover.large/medium`, `number_of_pages`, `publishers[0].name`, `publish_date`, `description.value/description`.
- [ ] Fallback Google Books: parsea `volumeInfo.title`, `authors[]`, `imageLinks.thumbnail` (reemplaza `zoom=1` → `zoom=4` para alta res), `pageCount`, `publisher`, `publishedDate`, `description`.
- [ ] Cache `TTLCache(maxsize=1000, ttl=3600)` — hit en segundo llamado < 5ms.
- [ ] Timeout `httpx.AsyncClient(timeout=5.0)`; retry `httpx.Retry(total=2, backoff_factor=0.5)`.
- [ ] Errores: `ISBNNotFoundError` (404 ambas APIs), `ISBNLookupError` (red/timeout), `InvalidISBNError` (formato).
- [ ] Tests: mock `httpx` responses (Open Library success, OL fail → GB success, ambas fail, cache hit).
- [ ] Endpoint `GET /api/v1/books/lookup` (feature 009) usa este servicio.

## Fuera de alcance

- Endpoint API (feature 009).
- Persistencia de cache (Redis) — en memoria suficiente para MVP.
- Búsqueda por título/autor (no ISBN) — feature futura.
- Rate limiting distribuido (multi-instancia) — feature 020.