# 025 · ISBN Lookup Fallback vía search.json

**Estado:** hecho

## Qué hace

Cuando un ISBN existe en Open Library pero no está indexado en su endpoint de
volúmenes, `GET /api/v1/books/lookup` (008/009) devuelve hoy 404 y el modal de
alta (014) se corta sin preview, sin llegar nunca a `POST /api/v1/books`. Esta
feature añade a `ISBNLookupService.buscar()` un paso intermedio: si Open Library
`/api/books` (bibkeys) no devuelve metadatos completos, se consulta **Open
Library `search.json` con `q=isbn:<isbn>`** —la misma fuente que ya usa el
typeahead (023)— **antes** de Google Books.

Orden de fuentes resultante en `buscar()`, y por tanto en `GET /lookup` y
`POST /api/v1/books`, que lo reutilizan:

1. Open Library `/api/books` (bibkeys) — sin cambios.
2. **Open Library `search.json` (nuevo)** — mismo dominio y operativa que 023.
3. Google Books — sin cambios, último recurso.

Del doc de search.json que contenga el ISBN buscado se devuelven: `title`,
`authors`, `cover_url` (portada construida desde `cover_i`) y `published_date`
(desde `first_publish_year`, decisión confirmada por el usuario). `description`,
`page_count` y `publisher` quedan en `None` (search.json no los aporta; las
columnas ya son nullable). Si el doc no produce metadatos completos (sin título,
autores o portada), se continúa a Google Books con el criterio de completitud
existente. Sin cambios de contrato: los endpoints siguen devolviendo
`BookMetadata`/`BookRead`; simplemente dejan de dar 404 para ISBNs que Open
Library solo indexa vía search.

## Por qué

Bug real con evidencia (ISBN 9780684838724, "Unlimited power" de Tony Robbins):
`/api/books?bibkeys=...` → 404; `search.json?q=...` → 200 con un doc que
contiene el ISBN; Google Books → 429 (sin `GOOGLE_BOOKS_API_KEY` configurada).
Efecto colateral: el alta se corta en el lookup (modal 014, sin preview ni POST).
Es exactamente el principio de misión "ISBN como llave maestra: metadatos de
Open Library / Google Books, nada de entrada manual" fallando en su primer
eslabón.

La fuente ya está probada (023 la usa para el typeahead), no requiere API key
(cuota 100 req/min de Open Library, absorbida por la caché existente) y el
cambio está acotado al servicio: un fetch + un mapeo reutilizando el patrón de
`_map_openlibrary_search`. `buscar_texto()` (023) y la UI (014) no se tocan, y
los consumidores (009, 014) heredan la corrección sin cambios. Riesgo bajo,
valor inmediato: recuperan el alta libros que hoy son imposibles de añadir.

## Criterios de aceptación

- [ ] Con los payloads reales de la evidencia como fixtures (mocks httpx:
      `/api/books` → 404; `search.json` → doc con `title:"Unlimited power"`,
      `author_name:["Tony Robbins"]`, `cover_i:4166860` y el ISBN buscado en su
      array `isbn`), `buscar("9780684838724")` devuelve title "Unlimited power",
      authors ["Tony Robbins"], cover_url
      `https://covers.openlibrary.org/b/id/4166860-M.jpg`, published_date
      "1987" (first_publish_year del fixture) y description/page_count/publisher
      = None.
- [ ] Orden de llamadas HTTP verificado en tests: `/api/books` → `search.json`
      (`q=isbn:<isbn>`) → Google Books. El paso search.json solo se ejecuta
      cuando el anterior no devolvió metadatos completos (404, sin datos, datos
      incompletos o error de red agotado).
- [ ] Solo se acepta un doc cuyo array `isbn` contenga el ISBN-13 normalizado
      buscado (equivalencia ISBN-10→13 aceptada vía `_resolver_isbn13`); si
      ningún doc lo contiene, se continúa a Google Books (test con docs de otros
      ISBNs).
- [ ] Si el doc con el ISBN mapea a una respuesta incompleta (p. ej. sin
      `cover_i` o sin `author_name`), NO se usa y se continúa a Google Books
      (criterio `_es_completo` intacto: title + authors + cover).
- [ ] Mapeo del doc: `title` ← `title`; `authors` ← `author_name`; `cover_url`
      ← `https://covers.openlibrary.org/b/id/<cover_i>-M.jpg` (None si no hay
      `cover_i`); `published_date` ← `str(first_publish_year)` (None si el doc
      no lo trae; `_parse_published_date` ya soporta '%Y'); `description`,
      `page_count`, `publisher` = None.
- [ ] El paso search.json usa el mismo `httpx.AsyncClient` inyectado y el mismo
      patrón timeout/reintentos que el resto de `buscar()` (5 s, 2 reintentos
      backoff 1s→2s): 4xx/5xx → tratado como sin datos y se continúa;
      timeout/red agotado → error registrado y se continúa a Google Books
      (tests de ambos caminos). Sin API keys hardcodeadas.
- [ ] Si las tres fuentes fallan → `ISBNNotFoundError` con mensaje descriptivo
      que menciona las fuentes intentadas en orden.
- [ ] Caché por ISBN (TTL 1 h) intacta: tras un lookup exitoso vía search.json,
      una segunda llamada `buscar()` con el mismo ISBN no genera ninguna llamada
      HTTP (test con mocks).
- [ ] `POST /api/v1/books` hereda el fallback sin cambios de contrato: con el
      ISBN de la evidencia crea el libro (201) con `description`, `page_count` y
      `publisher` en NULL y `published_date` = first_publish_year (test de
      integración con el servicio mockeado).
- [ ] `buscar_texto()` (023) y `GET /api/v1/books/suggestions` sin cambios de
      comportamiento: la suite existente de 008/009/023 pasa sin modificaciones.
- [ ] Las descripciones OpenAPI de `GET /lookup` y `POST /books` reflejan el
      orden de fuentes actualizado (mención del fallback search.json).
- [ ] Validación en verde: `cd apps/api && pytest -v`, `ruff check .` y
      `black --check .` sin fallos ni warnings.

## Fuera de alcance

- Configurar `GOOGLE_BOOKS_API_KEY` (acción de entorno/ops, no de código).
- Cambios en la UI del modal de alta (014) o en el endpoint de sugerencias
  (023): solo el servicio backend.
- Búsqueda full-text/trigram sobre la tabla local `books`.
- Aportar `description`, `page_count` o `publisher` desde search.json (no los
  expone; quedan None por diseño de esta feature).
- Timeout/reintentos propios para search.json en el flujo de lookup (usa el
  patrón existente de `buscar()`; el patrón 2 s sin reintentos sigue siendo
  exclusivo de `buscar_texto`/023).
- Caché dedicada para la llamada intermedia (el resultado final ya se cachea por
  ISBN en `buscar()`).
- Cambios en `ISBNLookupResponse`/`BookMetadata` o en `_es_completo` (sin
  cambios de contrato ni de criterio de completitud).
- Cache distribuida (Redis) y rate limiting por instancia → feature 020.
