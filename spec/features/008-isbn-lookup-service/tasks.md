# 008 · ISBN Lookup Service — Tasks Checklist

Granular checklist para el implementador. Cada tarea es pequeña, accionable y se marca con `[ ]` / `[x]`.

---

## 📋 Modelos Pydantic

- [x] **T1**: Crear `apps/api/app/models/isbn.py` con modelos Pydantic v2:
  - `ISBNRequest` con campo `isbn` (validación: 13 dígitos después de normalizar, quitar guiones/espacios, lanzar `InvalidISBNError` si no es válido)
  - `ISBNLookupResponse` con campos: `title`, `authors` (array[string]), `cover_url`, `page_count`, `publisher`, `published_date`, `description`
  - `InvalidISBNError` (excepción de dominio con código de error)
  - `ISBNNotFoundError` (excepción de dominio con código de error)

---

## 🔍 ISBNLookupService

- [x] **T2**: Implementar `apps/api/app/services/isbn_lookup.py` con la clase `ISBNLookupService`:
  - Método `normalizar_isbn(isbn: str) → str`: quitar guiones y espacios, validar largo 13, lanzar `InvalidISBNError`
  - Método `buscar(isbn: str) → ISBNLookupResponse`:
    - Normalizar ISBN
    - Intentar Open Library primero (HTTP GET a API Open Library)
    - Si Open Library no retorna datos completos (sin título, sin autores), fallback a Google Books (usar `settings.google_books_api_key` opcional)
    - Aplicar `_map_openlibrary()` o `_map_googlebooks()` para unificar campos a `ISBNLookupResponse`
    - Cachear resultado en dict en memoria con TTL 1 hora (verificar TTL en cada `get`)
    - Levantar `ISBNNotFoundError` si ambas APIs fallan
  - Atributos: `httpx.AsyncClient` con `timeout=5.0` y `Retry` personalizado (2 reintentos, backoff exponencial 1s→2s)
  - Inyección dependencia del `AsyncClient` (para tests)

---

## 🚀 Endpoint REST

- [x] **T3**: Crear `apps/api/app/api/v1/lookup.py` con el endpoint `GET /api/v1/books/lookup`:
  - Query param `isbn` (obligatorio, validado por el modelo `ISBNRequest`)
  - Inyectar `ISBNLookupService` como dependencia
  - Llamar `service.buscar(isbn)` y devolver `ISBNLookupResponse` JSON
  - Capturar `InvalidISBNError` → `HTTPException(422, detail={code, message})`
  - Capturar `ISBNNotFoundError` → `HTTPException(404, detail={code, message})`
  - Capturar errores HTTP (timeouts) → `HTTPException(504, detail={code, message})`

---

## 📦 Registro de router

- [x] **T4**: Registrar el router en `apps/api/app/api/v1/__init__.py`:
  - Importar `lookup.router`
  - Incluir en el `APIRouter` principal con prefix `/api/v1`

---

## 🧪 Tests unitarios

- [x] **T5**: Crear `apps/api/app/services/test_isbn_lookup.py` mockeando `httpx.AsyncClient`:
  - Test éxito Open Library (respuesta mock con datos completos)
  - Test fallback Google Books (Open Library vacío → Google Books retorna datos)
  - Test error en ambas APIs (ambos mocks fallan → `ISBNNotFoundError`)
  - Test hit de cache (segundo llamado idéntico retorna al instante < 5ms)
  - Test ISBN inválido (lanzar `InvalidISBNError`)

---

## 🧪 Test de integración

- [x] **T6**: Crear `apps/api/app/api/v1/test_lookup.py` usando `TestClient` de FastAPI:
  - Test endpoint `GET /api/v1/books/lookup?isbn=9788445001234` con éxito Open Library
  - Test que el endpoint usa el servicio correctamente (integración)
  - Test ISBN inválido via endpoint (422)
  - Test libro no encontrado via endpoint (404)

---

## ✅ Validación local

- [x] **T7**: Ejecutar validación completa en `apps/api/`:
  - [x] `pytest -v` → suite completa pasa (100%)
  - [x] `ruff check .` → sin warnings
  - [x] `black --check .` → sin formateo necesario
  - [x] Endpoint manual `curl "http://localhost:8000/api/v1/books/lookup?isbn=9788445001234"` devuelve JSON con campos esperados

---

## 📝 Notas

- Todas las tareas siguen la decisión técnica del plan: `httpx.AsyncClient` nativo, cache en memoria TTL 1h, fallback Open Library → Google Books, validación ISBN-13 simple (sin validación de dígito de control para MVP).
- Las excepciones de dominio `InvalidISBNError` y `ISBNNotFoundError` siguen la convención de `detail={code, message}` en los `HTTPException` del endpoint.
- El cache usa dict simple en memoria; migración a Redis es feature 020.