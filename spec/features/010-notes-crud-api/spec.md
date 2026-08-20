# 010 · Notes CRUD API

**Estado:** hecho

## Qué hace

Implementa endpoints de notas en `apps/api/app/api/v1/endpoints/notes.py` bajo `router.prefix = "/books/{book_id}/notes"`, tags=["notes"]. Requieren autenticación + ownership check (el `book_id` debe pertenecer al `user_id` del JWT).

Endpoints:
| Método | Ruta | Descripción | Request | Response |
|--------|------|-------------|---------|----------|
| GET | `/` | Listar notas del libro (paginado) | `page`, `page_size` | `NoteListResponse` |
| POST | `/` | Crear nota + disparar vectorización background | `NoteCreate` | `NoteRead` (201) |

Detalles:
- **Ownership check**: antes de cualquier operación, verifica `SELECT 1 FROM books WHERE id = book_id AND user_id = current_user_id`. 404 si no existe (no 403 para no filtrar existencia).
- **POST /notes**: inserta en `book_notes` con `user_id`, `book_id`, `content`, `content_html` (Markdown → HTML via `markdown2` o similar), `chunk_index=0` (nota completa, placeholder). Retorna `NoteRead` inmediatamente. **Luego** dispara tarea background (feature 016) para chunking + embeddings + upsert chunks reales (actualiza `chunk_index` y añade filas). No bloquea response.
- **GET /notes**: `.range()` paginación; orden `created_at DESC`; filtra `chunk_index = 0` (solo notas "padres", no chunks vectoriales) — o parámetro `include_chunks?` default false.

## Por qué

Notas son la unidad atómica de conocimiento. Separar creación (síncrona, rápida) de vectorización (asíncrona, pesada) mantiene UX fluida. Ownership check en API refuerza defensa en profundidad (RLS ya lo haría, pero 404 temprano evita queries innecesarias).

## Criterios de aceptación

- [ ] Router registrado en `api/v1/router.py`.
- [ ] Dependency `get_book_ownership(book_id: UUID, user_id: UUID) -> BookRead` reutilizable (lanza 404 si no dueño).
- [ ] `POST /notes`: valida `content` no vacío (min 1 char, max 50000); renderiza `content_html` con `markdown2` (sanitizado); inserta fila `chunk_index=0`; retorna 201 con `NoteRead`.
- [ ] Background task: `BackgroundTasks.add_task(vectorize_note, note_id, user_id, book_id, content)` (feature 016 implementa `vectorize_note`).
- [ ] `GET /notes`: paginación `page`≥1, `page_size` 1-50 (default 20); filtra `chunk_index = 0` por defecto; orden `created_at DESC`.
- [ ] Tests: ownership check (user A no ve notas de user B), vectorización disparada (mock background task), paginación, contenido HTML sanitizado (no XSS).

## Fuera de alcance

- Pipeline de vectorización real (feature 016).
- Endpoint `GET /notes/{note_id}` individual — no necesario para MVP.
- Edición/borrado de notas — feature futura (requiere re-vectorización).
- Búsqueda semántica en notas — feature 017 (RPC).