# 025 · ISBN Lookup Fallback vía search.json — Plan

## Enfoque

Extender `ISBNLookupService.buscar()` para conservar el flujo existente de
caché → Open Library `/api/books` → Google Books e insertar entre las dos
fuentes una consulta a Open Library `search.json?q=isbn:<isbn>`. El nuevo paso
reutilizará el `httpx.AsyncClient` inyectado, el timeout/reintentos del lookup,
la normalización ISBN y el criterio `_es_completo`, sin cambiar los contratos
Pydantic ni la UI. El resultado exitoso se mapeará a `ISBNLookupResponse` y se
guardará en la caché ISBN ya existente, de modo que los endpoints de lookup y
alta hereden la corrección automáticamente.

## Implementación

1. Actualizar la documentación de módulo y la orquestación de fuentes en
   `apps/api/app/services/isbn_lookup.py`: tras un resultado ausente o
   incompleto de `_fetch_openlibrary`, llamar a `search.json` con `q=isbn:<isbn>`
   antes de `_fetch_googlebooks`, acumulando en el error final las tres fuentes
   en su orden real.
2. Añadir en
   `apps/api/app/services/isbn_lookup.py` un fetch específico para
   `OPEN_LIBRARY_SEARCH_URL`, usando `_get_json` (timeout de 5 s y dos
   reintentos con backoff 1 s → 2 s). Tratar respuestas 4xx/5xx, JSON inválido,
   ausencia de `docs`, timeouts y errores de red agotados como fuente sin datos;
   registrar los errores de red y continuar siempre con Google Books.
3. Implementar el filtrado y mapeo del resultado search.json en
   `apps/api/app/services/isbn_lookup.py`: seleccionar únicamente un doc cuyo
   array `isbn` contenga el ISBN-13 normalizado solicitado, resolviendo ISBN-10
   mediante `_resolver_isbn13`; mapear `title`, `author_name`, `cover_i` a la
   URL de portada Open Library y `first_publish_year` a `published_date` como
   cadena. Dejar `description`, `page_count` y `publisher` en `None`, y pasar
   el resultado por `_es_completo` antes de aceptarlo.
4. Ampliar
   `apps/api/app/services/test_isbn_lookup.py` con fixtures de la evidencia real
   (9780684838724), verificando el mapeo completo, la coincidencia exacta del
   ISBN, el descarte de docs de otros ISBNs, el descarte de docs incompletos,
   errores HTTP y de red, reintentos y el orden de llamadas
   `/api/books` → `search.json` → Google Books. Cubrir también caché tras éxito
   search.json y el mensaje de `ISBNNotFoundError` cuando fallan las tres
   fuentes.
5. Ampliar
   `apps/api/app/api/v1/test_lookup.py` y los tests de libros existentes para
   comprobar que `GET /api/v1/books/lookup` y `POST /api/v1/books` consumen el
   resultado search.json sin cambios de contrato, crean el libro con los tres
   campos no aportados en `NULL` y conservan la fecha publicada.
6. Actualizar las descripciones OpenAPI de
   `apps/api/app/api/v1/endpoints/books.py` para documentar Open Library
   `/api/books`, el fallback intermedio `search.json` y Google Books como último
   recurso, tanto en lookup como en el flujo de alta; no modificar
   `ISBNLookupResponse`, `BookMetadata` ni `buscar_texto()`.
7. Ejecutar la validación backend desde `apps/api`: `pytest -v`, `ruff check .`
   y `black --check .`, confirmando también que la suite existente de
   sugerencias de la feature 023 permanece verde.

## Decisiones

- **Posición de search.json** — Se consulta después de `/api/books` y antes de
  Google Books, porque conserva la fuente primaria de la feature 008, reutiliza
  Open Library sin API key y evita consumir el fallback externo cuando la
  búsqueda ISBN de Open Library sí puede resolver el libro. No se altera
  `buscar_texto()`, cuyo timeout de 2 s y ausencia de reintentos son exclusivos
  del typeahead.
- **Criterio de aceptación del documento** — Se exige que `isbn` contenga el
  ISBN-13 buscado (con equivalencia ISBN-10 → ISBN-13) y que el mapeo cumpla
  `_es_completo` (título, autores y portada). Se descartan coincidencias
  parciales o docs de otros ISBNs para no devolver metadatos incorrectos; no se
  cambia el criterio global ni se crea un criterio especial para search.json.
- **Mapeo y contrato** — Se reutiliza `ISBNLookupResponse` y se deja en `None`
  la información que `search.json` no ofrece. No se añaden campos, modelos,
  dependencias ni endpoints nuevos; `/lookup` y `POST /books` reciben el
  beneficio mediante el servicio compartido.
- **HTTP, errores y caché** — Se reutiliza `_get_json`, el cliente inyectado y
  la caché ISBN TTL de una hora. Un fallo de search.json no detiene el flujo:
  continúa a Google Books y solo tras las tres fuentes se lanza
  `ISBNNotFoundError` descriptivo. Se descarta una caché separada para evitar
  duplicar estado y llamadas de mantenimiento.

## Riesgos

- **Un doc de search.json corresponde a otro ISBN o solo ofrece ISBN-10** — Se
  normalizan todos los identificadores con `_resolver_isbn13`, se compara contra
  el ISBN solicitado y se cubren fixtures con docs no coincidentes y conversión
  ISBN-10.
- **La respuesta search.json carece de portada, título o autores** — Se aplica
  `_es_completo`; el documento se descarta y el flujo continúa a Google Books,
  evitando previews incompletas.
- **Latencia o indisponibilidad de Open Library** — Se usa exactamente el
  timeout y los dos reintentos existentes; 4xx/5xx y errores agotados se
  registran, se incluyen en el diagnóstico final y no impiden el fallback.
- **Regresión en 023 o en el alta de libros** — El cambio se limita a
  `buscar()` y su mapeo; los tests de `buscar_texto()`, lookup, POST y la suite
  completa validan que no se modifiquen sus contratos ni comportamientos.
- **Caché devuelve datos obsoletos o evita verificar el fallback** — Se conserva
  la clave normalizada y TTL de una hora existentes; los tests comprueban que la
  segunda llamada exitosa vía search.json no realiza HTTP.
- **Documentación OpenAPI queda desalineada con el orden real** — Se actualan
  explícitamente los textos de los dos endpoints en `endpoints/books.py` y se
  revisa la generación del esquema durante la validación de la API.
