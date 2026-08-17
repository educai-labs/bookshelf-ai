# 009 · Books CRUD API

**Estado:** propuesta

## Qué hace

Implementa los 6 endpoints REST de libros en `apps/api/app/api/v1/endpoints/books.py` bajo `router.prefix = "/books"`, tags=["books"]. Todos requieren autenticación (`Depends(get_current_user)` → `user_id`). El cliente Supabase server-side (service_role) ejecuta queries; RLS filtra por `user_id` automáticamente.

Endpoints:
| Método | Ruta | Descripción | Request | Response |
|--------|------|-------------|---------|----------|
| GET | `/lookup` | Lookup metadatos por ISBN | `isbn` (query, char13) | `BookMetadata` |
| POST | `/` | Crear libro desde ISBN | `BookCreate` | `BookRead` (201) |
| GET | `/` | Listar libros (paginado, filtros) | `page`, `page_size`, `status?`, `rating?`, `q?` (búsqueda título/autor) | `BookListResponse` |
| GET | `/{book_id}` | Obtener libro + notas_count | — | `BookRead` |
| PATCH | `/{book_id}` | Actualizar campos editables | `BookUpdate` | `BookRead` |
| DELETE | `/{book_id}` | Borrar libro (cascada notas) | — | 204 |

Validaciones:
- `POST /books`: `isbn13` unique por user (RLS + DB constraint). Si ya existe → 409 Conflict.
- `PATCH`: al menos un campo presente; `rating` 1-5; `status` enum válido.
- `GET /books`: `page`≥1, `page_size` 1-100 (default 20); filtros `status` (enum), `rating` (1-5), `q` (ILIKE título/autores).

## Por qué

API completa de libros es el core del producto. Separar `lookup` (solo metadatos, sin persistir) de `create` (persiste) permite UX "preview antes de guardar". Paginación y filtros soportan dashboard escalable. Auth + RLS garantizan aislamiento sin lógica extra.

## Criterios de aceptación

- [ ] Router registrado en `api/v1/router.py` con prefix `/api/v1`.
- [ ] Todos los endpoints tienen `dependencies=[Depends(get_current_user)]`.
- [ ] `GET /lookup` delega a `ISBNLookupService.lookup()` (feature 008).
- [ ] `POST /books`: inserta en `books` con `user_id` del JWT; retorna `BookRead` con `id`, `created_at`, `updated_at`.
- [ ] `GET /books`: query con `.range()` (paginación Supabase), `.eq()/ilike()` filtros, `.select("*, book_notes(count)")` para `notes_count`.
- [ ] `GET /books/{id}`: `.single()` + join count notas; 404 si no existe o no pertenece a user.
- [ ] `PATCH /books/{id}`: `.update()` solo campos proporcionados; actualiza `updated_at` via trigger.
- [ ] `DELETE /books/{id}`: `.delete()`; RLS + FK CASCADE borra notas; 204.
- [ ] Errores: 401 (auth), 404 (no encontrado), 409 (ISBN duplicado), 422 (validación Pydantic), 500 (DB error) con formato `{code, message, field?}`.
- [ ] Tests: `httpx.AsyncClient` contra app (testcontainers o Supabase local); casos happy + edge (paginación, filtros, duplicados, auth).

## Fuera de alcance

- Endpoint `/books/{id}/notes` (feature 010).
- Frontend consumo (features 013, 014).
- Búsqueda full-text / trigram (feature futura).
- Importación masiva / CSV.