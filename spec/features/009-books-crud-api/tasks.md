# 009 · Books CRUD API — Tasks Checklist

Granular checklist para el implementador. Cada tarea es pequeña, accionable y se marca con `[ ]` / `[x]`.

---

## 📋 Modelos Pydantic

- [x] **T1**: Crear `apps/api/app/models/books.py` con modelos Pydantic v2:
  - `BookMetadata`: respuesta de `GET /lookup` (title, authors, cover_url, page_count, publisher, published_date, description, isbn13)
  - `BookCreate`: request de `POST /books` (isbn13, status?, rating?, started_at?, finished_at?)
  - `BookUpdate`: request de `PATCH /books/{id}` (status?, rating?, started_at?, finished_at?) — al menos un campo requerido
  - `BookRead`: respuesta común (id, user_id, isbn13, title, authors, cover_url, page_count, publisher, published_date, description, status, rating, started_at, finished_at, created_at, updated_at, notes_count)
  - `BookListResponse`: respuesta paginada (items: BookRead[], total: int, page: int, page_size: int, total_pages: int)
  - Validaciones Pydantic: `isbn13` regex `^\d{13}$`, `rating` ge=1 le=5, `status` enum `book_status`, `page` ge=1, `page_size` ge=1 le=100

---

## 🔍 ISBNLookupService

- [x] **T2**: Utilizar/verificar `ISBNLookupService.lookup()` (feature 008) para el endpoint `GET /lookup` — si el servicio aún no está implementado, esta tarea se reactivará en el ciclo de actualización; si ya está hecho, marcará `[x]` automáticamente al validar la dependencia

---

## 🚀 Endpoints en `books.py`

- [x] **T3**: Crear `apps/api/app/api/v1/endpoints/books.py` con los 6 endpoints REST:
  - Router: `router = APIRouter(prefix="/books", tags=["books"])`
  - Dependency común: `dependencies=[Depends(get_current_user)]` a nivel de cada endpoint

  Endpoints:
  1. **GET `/lookup`**: `isbn: str = Query(..., pattern=r"^\d{13}$")` → delega a `ISBNLookupService.lookup(isbn)` → retorna `BookMetadata`. Maneja 404 (no encontrado en APIs externas) y 500 (error de red).
  2. **POST `/`**: `book_in: BookCreate` → insert en `books` con `user_id` del JWT + metadatos via `ISBNLookupService.lookup()`. Retorna `BookRead` 201. Maneja 409 (unique violation isbn13+user_id), 422 (validación).
  3. **GET `/`**: Parámetros `page`, `page_size`, `status?`, `rating?`, `q?` → query Supabase con `.range()`, `.eq()`, `.ilike()` sobre `title` y `authors`, `.select("*, book_notes(count)")` → mapear a `BookListResponse`.
  4. **GET `/{book_id}`**: `book_id: UUID = Path(...)` → `.select("*, book_notes(count)").eq("id", book_id).single()` → 404 si None → `BookRead`.
  5. **PATCH `/{book_id}`**: `book_in: BookUpdate` → validar al menos un campo → `.update(book_in.model_dump(exclude_unset=True)).eq("id", book_id).execute()` → trigger actualiza `updated_at` → retorna `BookRead` actualizado. 404 si no existe/no pertenece a user.
  6. **DELETE `/{book_id}`**: `.delete().eq("id", book_id).execute()` → 204. RLS + FK CASCADE borra notas.

---

## 📦 Registro del router

- [x] **T4**: En `apps/api/app/api/v1/router.py`:
  - Importar `books.router`
  - `router.include_router(books.router)` (el prefix `/api/v1` ya está en el router principal)

---

## ⚠️ Manejo de errores consistente

- [x] **T5**: Crear/helper `raise_http_exception(code: str, message: str, field: str | None = None, status_code: int = 500)` que lance `HTTPException(detail={"code": code, "message": message, "field": field})`.
- [x] Mapear errores Supabase: `unique_violation` → 409 `{code: "isbn_duplicate", message: "ISBN ya registrado", field: "isbn13"}`; `foreign_key_violation` → 404; Pydantic validation → 422 con details.

---

## 🧪 Tests

- [x] **T6**: Crear `apps/api/tests/test_books.py` con fixtures: `client: AsyncClient`, `auth_headers: dict`, `sample_book_data: dict`, `created_book: dict`.
  - Casos happy path: cada endpoint 2xx con aserciones de respuesta.
  - Casos edge:
    - Paginación: página 1, página 2, page_size límites (1, 100), página vacía.
    - Filtros: status (cada enum), rating (1-5), q (búsqueda título/autor, case-insensitive).
    - Duplicado: POST mismo ISBN dos veces → 409.
    - Auth: sin token → 401, token inválido → 401.
    - No encontrado: GET/PATCH/DELETE ID inexistente → 404.
    - Validación: PATCH sin campos → 422, rating 0 o 6 → 422, isbn13 inválido → 422.
    - DELETE cascada: crear libro + nota → DELETE libro → verificar nota borrada.
  - Ejecutar: `cd apps/api && pytest tests/test_books.py -v`

---

## ✅ Validación local

- [x] **T7**: Ejecutar validación completa en `apps/api/`:
  - [x] `cd apps/api && ruff check . && black --check .` → sin warnings/errors
  - [x] `cd apps/api && pytest -v` → suite completa pasa (100%)
  - [x] Endpoint manual `curl "http://localhost:8000/api/v1/books/lookup?isbn=9788445001234"` devuelve JSON con campos esperados

---

## ✅ Validación contra criterios de aceptación (spec.md)

- [x] **T8**: Verificar todos los criterios de aceptación de `spec/features/009-books-crud-api/spec.md` — si algún criterio ya estuviera cubierto por trabajo previo, esta tarea marcará `[x]`; de lo contrario, servirá como checklist de validación final
  - [x] Router registrado en `api/v1/router.py` con prefix `/api/v1`.
  - [x] Todos los endpoints tienen `dependencies=[Depends(get_current_user)]`.
  - [x] `GET /lookup` delega a `ISBNLookupService.lookup()` (feature 008).
  - [x] `POST /books`: inserta en `books` con `user_id` del JWT; retorna `BookRead` con `id`, `created_at`, `updated_at`.
  - [x] `GET /books`: query con `.range()` (paginación Supabase), `.eq()/ilike()` filtros, `.select("*, book_notes(count)")` para `notes_count`.
  - [x] `GET /books/{id}`: `.single()` + join count notas; 404 si no existe o no pertenece a user.
  - [x] `PATCH /books/{id}`: `.update()` solo campos proporcionados; actualiza `updated_at` via trigger.
  - [x] `DELETE /books/{id}`: `.delete()`; RLS + FK CASCADE borra notas; 204.
  - [x] Errores: 401 (auth), 404 (no encontrado), 409 (ISBN duplicado), 422 (validación Pydantic), 500 (DB error) con formato `{code, message, field?}`.
  - [x] Tests: `httpx.AsyncClient` contra app (testcontainers o Supabase local); casos happy + edge (paginación, filtros, duplicados, auth).

---

## 📝 Notas

- Todas las tareas siguen la decisión técnica del plan: `httpx.AsyncClient` nativo, cache en memoria TTL 1h (feature 008), fallback Open Library → Google Books, validación ISBN-13 simple.
- Las excepciones de dominio siguen la convención de `detail={code, message}` en los `HTTPException`.
- El cache usa dict simple en memoria; migración a Redis es feature 020.
- PATCH "al menos un campo" implementado en modelo `BookUpdate` con `model_validator`.
- Tests contra Supabase local/testcontainers: usar Supabase local (Docker) para tests de integración reales; RLS, triggers, constraints se prueban igual que en prod.