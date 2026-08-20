# 010 · Notes CRUD API — Checklist de Tareas

**Estado:** hecho  
**Se basa en:** `plan.md` y `spec.md`

---

## Checklist principal

Estas tareas están ordenadas para fluidez de implementación. Cada tarea es una acción pequeña y accionable que puede marcarse como `[x]` al completarse.

- [x] **T1:** Crear archivo `apps/api/app/models/notes.py` con modelos Pydantic v2: `NoteCreate` (content: str, min_length=1, max_length=50000), `NoteRead` (id, book_id, content, content_html, chunk_index, created_at), `NoteListResponse` (items: list[NoteRead], total: int, page: int, page_size: int)

- [x] **T2:** Añadir dependencias `markdown2>=2.4.0` y `bleach>=6.0.0` a `apps/api/pyproject.toml`

- [x] **T3:** Implementar dependency `get_book_ownership(book_id: UUID, user_id: UUID) -> BookRead` en `apps/api/app/api/v1/dependencies.py` (o `core/security.py`):
  - Query: `SELECT * FROM books WHERE id = book_id AND user_id = user_id`
  - Lanza `HTTPException(404, detail={code: "BOOK_NOT_FOUND", message: "Book not found"})` si no existe

- [x] **T4:** Crear endpoints `apps/api/app/api/v1/endpoints/notes.py`:
  - Router: `APIRouter(prefix="/books/{book_id}/notes", tags=["notes"])`
  - **POST /**: 
    - Depends: `get_current_user`, `get_book_ownership`
    - Valida `NoteCreate`, renderiza `content_html = markdown2.markdown(content)`, sanitiza con `bleach.clean()`
    - Inserta en `book_notes`: `user_id`, `book_id`, `content`, `content_html`, `chunk_index=0`, `embedding` placeholder (vector zeros 768)
    - `BackgroundTasks.add_task(vectorize_note, note_id, user_id, book_id, content)` — stub que importará de feature 016
    - Retorna `NoteRead` 201
  - **GET /**:
    - Depends: `get_current_user`, `get_book_ownership`
    - Query params: `page: int = 1 (ge=1)`, `page_size: int = 20 (ge=1, le=50)`, `include_chunks: bool = False`
    - Query Supabase: `.select("*").eq("book_id", book_id).eq("user_id", user_id)`
    - Si `not include_chunks`: `.eq("chunk_index", 0)`
    - Orden: `.order("created_at", desc=True)`
    - Paginación: `.range((page-1)*page_size, page*page_size - 1)`
    - Count total para response

- [x] **T5:** Registrar router de notes en `apps/api/app/api/v1/router.py`: `router.include_router(notes.router)`

- [x] **T6:** Crear tests `apps/api/tests/test_notes.py`:
  - `test_create_note_success`: crea nota, verifica 201, `content_html` renderizado, `chunk_index=0`
  - `test_create_note_empty_content_fails`: 422 validation error
  - `test_create_note_xss_sanitized`: contenido con `<script>` → sanitizado en `content_html`
  - `test_get_notes_pagination`: crea N notas, verifica page/page_size/total
  - `test_get_notes_filters_chunks_by_default`: solo `chunk_index=0` salvo `include_chunks=true`
  - `test_ownership_check_user_a_cannot_access_user_b_notes`: 404
  - `test_background_task_enqueued`: mock `BackgroundTasks.add_task`, verifica llamada con args correctos

- [x] **T7:** Ejecutar validación final:
  - [x] `pytest apps/api/tests/test_notes.py -v` pasa al 100%
  - [x] `ruff check apps/api && black --check apps/api` sin warnings
  - [x] `docker build -t bookshelf-api apps/api` exitoso
  - [x] Verificación manual: `POST /books/{id}/notes` → 201, `GET /books/{id}/notes` → lista paginada

- [x] **T8:** Validar contra los criterios de aceptación de `spec.md`:
  - [x] Router registrado en `api/v1/router.py`
  - [x] Dependency `get_book_ownership` reutilizable (lanza 404 si no dueño)
  - [x] `POST /notes`: valida content no vacío (min 1, max 50000); renderiza `content_html` con `markdown2` (sanitizado); inserta fila `chunk_index=0`; retorna 201 con `NoteRead`
  - [x] Background task: `BackgroundTasks.add_task(vectorize_note, note_id, user_id, book_id, content)` (feature 016 implementa `vectorize_note`)
  - [x] `GET /notes`: paginación `page`≥1, `page_size` 1-50 (default 20); filtra `chunk_index = 0` por defecto; orden `created_at DESC`
  - [x] Tests: ownership check (user A no ve notas de user B), vectorización disparada (mock background task), paginación, contenido HTML sanitizado (no XSS)

- [x] **T9:** Mover la feature a "Hecho" en `../../constitution/roadmap.md`
  > _Pendiente: según `AGENTS.md` (Fase 2, paso 8) el movimiento a "Hecho" lo ejecuta el subagente `roadmap` tras la aprobación del revisor. El implementador no modifica la constitución.

---

## Mantenimiento (opcional)

_Eliminar esta sección si no aplica. Esta feature no requiere acciones recurrentes al tocarla en el futuro._

---

**Notas:**
- Tareas de implementación (T1-T5) y validación (T6-T8) están diseñadas para ser independientes y marcarse `[x]` completadas individualmente.
- T8 asegura que todos los criterios de `spec.md` queden cubiertos antes de mover a "Hecho".
- La tarea T9 es el cierre administrativo que permite la feature pasar al estado `hecho` en la carretera.