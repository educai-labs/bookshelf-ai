# 010 · Notes CRUD API — Plan de Implementación

**Estado:** propuesta
**Fecha:** 2026-08-19

---

## Enfoque

Implementar endpoints REST de notas bajo `/books/{book_id}/notes` en FastAPI siguiendo la arquitectura existente del proyecto. La estrategia es:

1. **Separar creación síncrona de vectorización asíncrona**: El `POST /notes` persiste la nota completa (`chunk_index=0`) y retorna inmediatamente 201. La vectorización (chunking + embeddings + upsert de chunks reales) se dispara vía `BackgroundTasks` y la implementa feature 016.
2. **Ownership check reutilizable**: Dependency `get_book_ownership(book_id, user_id)` que valida que el libro pertenece al usuario autenticado (404 si no existe, no 403 para no filtrar existencia).
3. **Paginación estándar**: `GET /notes` usa `.range()` de Supabase con orden `created_at DESC` y filtra `chunk_index=0` por defecto (solo notas "padres").
4. **Modelos Pydantic v2**: Request/Response models en `apps/api/app/models/notes.py` con validación de contenido (1-50000 chars) y sanitizado HTML via `markdown2` + `bleach`.

Esta aproximación encaja con el stack (FastAPI, Pydantic v2, Supabase, BackgroundTasks) y respeta límites duros: no toca migraciones existentes, usa `service_role` solo en background task, y separa responsabilidades (API vs vectorización).

---

## Implementación

### 1. Modelos Pydantic (`apps/api/app/models/notes.py`)
- `NoteCreate`: `content: str` (min_length=1, max_length=50000)
- `NoteRead`: `id`, `book_id`, `content`, `content_html`, `chunk_index`, `created_at`
- `NoteListResponse`: `items: list[NoteRead]`, `total: int`, `page: int`, `page_size: int`

### 2. Dependency de ownership (`apps/api/app/api/v1/dependencies.py` o `core/security.py`)
- `async def get_book_ownership(book_id: UUID, user_id: UUID) -> BookRead:`
  - Query: `SELECT * FROM books WHERE id = book_id AND user_id = user_id`
  - Lanza `HTTPException(404, detail={code: "BOOK_NOT_FOUND", message: "Book not found"})` si no existe

### 3. Endpoints (`apps/api/app/api/v1/endpoints/notes.py`)
- Router: `router = APIRouter(prefix="/books/{book_id}/notes", tags=["notes"])`
- `POST /`:
  - Depends: `get_current_user`, `get_book_ownership`
  - Valida `NoteCreate`, renderiza `content_html = markdown2.markdown(content)`, sanitiza con `bleach.clean()`
  - Inserta en `book_notes`: `user_id`, `book_id`, `content`, `content_html`, `chunk_index=0`, `embedding` placeholder (vector zeros 768)
  - `BackgroundTasks.add_task(vectorize_note, note_id, user_id, book_id, content)` — función stub que importará de feature 016
  - Retorna `NoteRead` 201
- `GET /`:
  - Depends: `get_current_user`, `get_book_ownership`
  - Query params: `page: int = 1 (ge=1)`, `page_size: int = 20 (ge=1, le=50)`, `include_chunks: bool = False`
  - Query Supabase: `.select("*").eq("book_id", book_id).eq("user_id", user_id)`
  - Si `not include_chunks`: `.eq("chunk_index", 0)`
  - Orden: `.order("created_at", desc=True)`
  - Paginación: `.range((page-1)*page_size, page*page_size - 1)`
  - Count total para response

### 4. Registro de router (`apps/api/app/api/v1/router.py`)
- `router.include_router(notes.router)`

### 5. Tests (`apps/api/tests/test_notes.py`)
- `test_create_note_success`: crea nota, verifica 201, `content_html` renderizado, `chunk_index=0`
- `test_create_note_empty_content_fails`: 422 validation error
- `test_create_note_xss_sanitized`: contenido con `<script>` → sanitizado en `content_html`
- `test_get_notes_pagination`: crea N notas, verifica page/page_size/total
- `test_get_notes_filters_chunks_by_default`: solo `chunk_index=0` salvo `include_chunks=true`
- `test_ownership_check_user_a_cannot_access_user_b_notes`: 404
- `test_background_task_enqueued`: mock `BackgroundTasks.add_task`, verifica llamada con args correctos

### 6. Dependencia `markdown2` y `bleach`
- Añadir a `apps/api/pyproject.toml`: `markdown2>=2.4.0`, `bleach>=6.0.0`
- Justificación: renderizado Markdown→HTML + sanitizado XSS (requerido por criterio de aceptación)

---

## Decisiones

| Decisión | Justificación | Alternativas descartadas |
|----------|---------------|--------------------------|
| `chunk_index=0` como placeholder en creación | Permite retornar nota inmediatamente; vectorización real actualiza chunks después | Insertar chunks reales en request síncrono → bloquea response, UX pobre |
| `BackgroundTasks` de FastAPI para vectorización | Nativo, simple, no requiere Celery/Redis para MVP | Celery/Redis → overkill, añade infraestructura |
| 404 (no 403) en ownership check | Evita filtrar existencia de libros ajenos (defensa en profundidad) | 403 → revela que el libro existe pero no es tuyo |
| Filtro `chunk_index=0` por defecto en GET | UX: usuario ve notas completas, no fragmentos vectoriales | Devolver todo → ruido, chunks no son "notas" para el usuario |
| `markdown2` + `bleach` para HTML | Ligero, estándar, sanitizado robusto | `mistune` + `bleach` → similar, `markdown2` más simple para este caso |
| Embedding placeholder (vector zeros) en creación | `embedding` es NOT NULL en schema; vectorización real lo sobrescribe | Hacer `embedding` nullable → rompe RPC `match_book_notes` que espera vector |

---

## Riesgos

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| `vectorize_note` no implementada aún (feature 016) | Background task falla silenciosamente si no existe | Stub que loggea warning; feature 016 implementará la real. Tests mockean la llamada. |
| Sanitizado HTML incompleto → XSS | Seguridad crítica | Usar `bleach.clean()` con tags/attributes permitidos whitelist; test unitario con payloads XSS. |
| Paginación `.range()` ineficiente en tablas grandes | Performance | Índices en `(user_id, book_id, chunk_index, created_at)` ya existen por RLS/PK. Monitorizar. |
| Race condition: nota creada pero vectorización falla | Datos inconsistentes (chunks no generados) | Feature 016 debe implementar reintentos + logging; endpoint POST no bloquea, UX no afectada. |
| Cambio en schema `book_notes` (ej. embedding dims) | Rompe inserción | Schema fijado en tech-stack (768 dims, text-embedding-004). Cambio = migración completa. |

---

## Validación

- [ ] `pytest apps/api/tests/test_notes.py -v` pasa al 100%
- [ ] `ruff check apps/api && black --check apps/api` sin warnings
- [ ] `docker build -t bookshelf-api apps/api` exitoso
- [ ] Verificación manual: `POST /books/{id}/notes` → 201, `GET /books/{id}/notes` → lista paginada