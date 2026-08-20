# 009 · Books CRUD API — Plan de Implementación

## Enfoque

Implementar los 6 endpoints REST de libros en `apps/api/app/api/v1/endpoints/books.py` bajo un router con `prefix="/books"` y `tags=["books"]`. Todos los endpoints requerirán autenticación mediante `Depends(get_current_user)` que extrae el `user_id` del JWT verificado. El cliente Supabase server-side (service_role) ejecutará las queries; RLS filtrará automáticamente por `user_id` garantizando aislamiento de datos sin lógica extra.

La estrategia sigue el patrón establecido en el stack: FastAPI + Pydantic v2 para validación, Supabase client para acceso a datos, manejo de errores estandarizado con `HTTPException` y formato `{code, message, field?}`. Se reutilizará `ISBNLookupService.lookup()` (feature 008) para el endpoint `GET /lookup`. Los tests usarán `httpx.AsyncClient` contra la app FastAPI con base de datos de test (testcontainers o Supabase local).

## Implementación

### 1. Modelos Pydantic (Request/Response)
**Archivo:** `apps/api/app/models/books.py` (nuevo o extendido)
- `BookMetadata`: respuesta de `GET /lookup` (title, authors, cover_url, page_count, publisher, published_date, description, isbn13)
- `BookCreate`: request de `POST /books` (isbn13, status?, rating?, started_at?, finished_at?)
- `BookUpdate`: request de `PATCH /books/{id}` (status?, rating?, started_at?, finished_at?) — al menos un campo requerido
- `BookRead`: respuesta común (id, user_id, isbn13, title, authors, cover_url, page_count, publisher, published_date, description, status, rating, started_at, finished_at, created_at, updated_at, notes_count)
- `BookListResponse`: respuesta paginada (items: BookRead[], total: int, page: int, page_size: int, total_pages: int)
- Validaciones Pydantic: `isbn13` regex `^\d{13}$`, `rating` ge=1 le=5, `status` enum `book_status`, `page` ge=1, `page_size` ge=1 le=100.

### 2. Endpoints en `books.py`
**Archivo:** `apps/api/app/api/v1/endpoints/books.py` (nuevo)
- Importar `APIRouter`, `Depends`, `HTTPException`, `status`, `Query`, `Path`, modelos, `get_current_user`, `get_supabase_client`.
- Router: `router = APIRouter(prefix="/books", tags=["books"])`
- Dependency común: `dependencies=[Depends(get_current_user)]` en cada endpoint o a nivel router.

Endpoints:
1. **GET `/lookup`**: `isbn: str = Query(..., pattern=r"^\d{13}$")` → delega a `ISBNLookupService.lookup(isbn)` → retorna `BookMetadata`. Maneja 404 (no encontrado en APIs externas) y 500 (error de red).
2. **POST `/`**: `book_in: BookCreate` → insert en `books` con `user_id` del JWT + campos de `BookMetadata` obtenidos via `ISBNLookupService.lookup()` (o requiere que el cliente envíe metadatos completos; espec dice "Crear libro desde ISBN" → asumimos lookup interno). Retorna `BookRead` 201. Maneja 409 (unique violation isbn13+user_id), 422 (validación).
3. **GET `/`**: Parámetros `page`, `page_size`, `status?`, `rating?`, `q?` → query Supabase con `.range()`, `.eq()`, `.ilike()` sobre `title` y `authors`, `.select("*, book_notes(count)")` → mapear a `BookListResponse`.
4. **GET `/{book_id}`**: `book_id: UUID = Path(...)` → `.select("*, book_notes(count)").eq("id", book_id).single()` → 404 si None → `BookRead`.
5. **PATCH `/{book_id}`**: `book_in: BookUpdate` → validar al menos un campo → `.update(book_in.model_dump(exclude_unset=True)).eq("id", book_id).execute()` → trigger actualiza `updated_at` → retorna `BookRead` actualizado. 404 si no existe/no pertenece a user.
6. **DELETE `/{book_id}`**: `.delete().eq("id", book_id).execute()` → 204. RLS + FK CASCADE borra notas.

### 3. Registro del router
**Archivo:** `apps/api/app/api/v1/router.py`
- Importar `books.router` y `router.include_router(books.router)` (el prefix `/api/v1` ya está en el router principal).

### 4. Manejo de errores consistente
- Crear/usar exception handler global o helper `raise_http_exception(code: str, message: str, field: str | None = None, status_code: int = 500)` que lance `HTTPException(detail={"code": code, "message": message, "field": field})`.
- Mapear errores Supabase: `unique_violation` → 409 `{code: "isbn_duplicate", message: "ISBN ya registrado", field: "isbn13"}`; `foreign_key_violation` → 404; Pydantic validation → 422 con details.

### 5. Tests
**Archivo:** `apps/api/tests/test_books.py` (nuevo)
- Fixtures: `client: AsyncClient`, `auth_headers: dict`, `sample_book_data: dict`, `created_book: dict`.
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

### 6. Lint y validación
- `cd apps/api && ruff check . && black --check .`
- `cd apps/api && pytest -v` (suite completa)

## Decisiones

1. **Lookup interno en POST `/books`**: El spec dice "Crear libro desde ISBN". Decidimos que el endpoint haga internamente `ISBNLookupService.lookup(isbn)` y use esos metadatos para poblar el libro, en lugar de exigir al cliente enviar todos los campos. *Justificación*: UX "preview antes de guardar" (separar lookup de create), evita duplicar datos en request, consistente con feature 008. *Alternativa descartada*: Cliente envía todos los campos → más frágil, requiere que frontend haga lookup aparte antes de crear.

2. **Router-level dependency vs endpoint-level**: Usar `dependencies=[Depends(get_current_user)]` a nivel de cada endpoint (no router) para claridad y permitir futuros endpoints públicos (ej. lookup sin auth, aunque spec dice todos requieren auth). *Justificación*: Explícito, fácil de auditar, compatible con OpenAPI generado.

3. **notes_count via `.select("*, book_notes(count)")`**: Supabase PostgREST soporta count embebido en select. *Justificación*: Una sola query, evita N+1, eficiente. *Alternativa descartada*: RPC o subquery manual → más complejidad.

4. **Error format `{code, message, field?}`**: Alineado con convención en `tech-stack.md` línea 122. *Justificación*: Consistencia en todo el backend, frontend puede mapear codes a mensajes/i18n.

5. **Validación PATCH "al menos un campo"**: Implementada en modelo `BookUpdate` con `model_validator(mode="after")` que verifica `any(v is not None for v in self.model_dump().values())`. *Justificación*: Evita requests vacíos que no cambian nada.

6. **Tests contra Supabase local/testcontainers**: Usar Supabase local (Docker) para tests de integración reales. *Justificación*: RLS, triggers, constraints se prueban igual que en prod. Testcontainers sería alternativa si no hay Docker en CI.

## Riesgos

1. **RLS no filtra correctamente en tests**: Si el cliente de test usa `service_role` sin `postgrest` headers, RLS no aplica. *Mitigación*: En tests, usar cliente anon/auth con JWT real (generado via Supabase Auth admin API) o configurar `postgrest` headers `x-supabase-user-id` en requests de test.

2. **ISBNLookupService no disponible / falla en tests**: Feature 008 debe estar hecha. *Mitigación*: Mockear `ISBNLookupService.lookup` en tests unitarios de endpoints; tests de integración requieren 008 implementado o service mockeado.

3. **Unique constraint race condition**: Dos requests simultáneos POST mismo ISBN → uno pasa, otro 409. *Mitigación*: Confiar en DB constraint (atómico). Capturar `asyncpg.exceptions.UniqueViolationError` (o error Supabase equivalente) y mapear a 409.

4. **Paginación Supabase `.range()` offset-based**: Para datasets grandes, offset es lento. *Mitigación*: Acceptable para MVP (páginas pequeñas, usuarios pocos libros). Futuro: cursor-based pagination (feature separada).

5. **Trigger `set_updated_at` no dispara en PATCH parcial**: El trigger en `books` debe disparar en cualquier UPDATE. *Mitigación*: Verificar en migración existente (001_init o 002_rls) que trigger existe y cubre UPDATE. Test: PATCH → comprobar `updated_at` > `created_at`.

6. **Rate limit Open Library en tests**: `GET /lookup` usa Open Library. *Mitigación*: Cache en memoria (TTL 1h) ya especificado en tech-stack; en tests, mockear service o usar Google Books fallback.