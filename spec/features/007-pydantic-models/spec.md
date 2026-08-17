# 007 · Pydantic Models

**Estado:** propuesta

## Qué hace

Define todos los modelos Pydantic v2 (request/response) para la API v1 en `apps/api/app/models/`. Cubren: libros (CRUD + lookup), notas (CRUD), chat IA (request/response streaming), recomendaciones, y metadatos ISBN normalizados.

Modelos requeridos:
- **BookMetadata** — salida normalizada de lookup ISBN: `isbn13`, `title`, `authors[]`, `cover_url`, `page_count`, `publisher`, `published_date`, `description`.
- **BookCreate** — input `POST /books`: `isbn13` (char13), `status?`, `rating?`, `started_at?`, `finished_at?` (metadatos vienen de lookup, no se envían).
- **BookUpdate** — input `PATCH /books/{id}`: `status?`, `rating?`, `started_at?`, `finished_at?` (campos opcionales).
- **BookRead** — output `GET /books`, `GET /books/{id}`: todos los campos de `books` + `notes_count?` (opcional, para listado).
- **BookListResponse** — paginado: `items: BookRead[]`, `total: int`, `page: int`, `page_size: int`.
- **NoteCreate** — input `POST /books/{id}/notes`: `content: str` (Markdown, min 1 char).
- **NoteRead** — output `GET /books/{id}/notes`: `id`, `book_id`, `content`, `content_html`, `chunk_index`, `created_at`.
- **NoteListResponse** — paginado: `items: NoteRead[]`, `total: int`, `page: int`, `page_size: int`.
- **ChatRequest** — input `POST /ai/chat`: `query: str`, `book_id?: uuid`, `mode?: "book" | "rag"` (default: "book" si `book_id`, else "rag").
- **ChatResponseChunk** — chunk SSE: `chunk: str`, `done: bool`, `error?: str`.
- **RecommendationRequest** — (futuro, feature 018) input `GET /ai/recommendations`: `limit?: int` (default 5).
- **RecommendationItem** — `title`, `authors[]`, `reason`, `confidence: float`.
- **RecommendationResponse** — `recommendations: RecommendationItem[]`.

Todos los modelos: `model_config = ConfigDict(from_attributes=True, populate_by_name=True, extra="forbid")`.

## Por qué

Contrato único de API: frontend, tests, MCP y documentación (OpenAPI auto-generada) consumen los mismos modelos. Validación estricta (`extra="forbid"`) evita datos sucios. Separar Create/Update/Read permite campos distintos por operación (ej. `isbn13` solo en create).

## Criterios de aceptación

- [ ] Archivo `apps/api/app/models/__init__.py` exporta todos los modelos.
- [ ] `BookMetadata` valida ISBN-13 (regex `^\d{13}$`), `page_count > 0`, `rating 1-5`.
- [ ] `BookCreate` requiere `isbn13`; campos opcionales con defaults sensatos (`status=want_to_read`).
- [ ] `BookUpdate` todos opcionales; al menos uno presente (validar con `@model_validator(mode="after")`).
- [ ] `ChatRequest` valida: `query` min 1 char, max 4000; `book_id` UUID válido si presente; `mode` enum.
- [ ] `ChatResponseChunk` serializable a JSON Lines SSE (`data: {...}\n\n`).
- [ ] OpenAPI generada (`GET /openapi.json`) incluye todos los schemas sin errores.
- [ ] Tests unitarios: validación happy path + casos inválidos (ISBN malformed, rating 0, query vacío, etc.).

## Fuera de alcance

- Endpoints que usan estos modelos (features 008-010, 017, 018).
- Modelos Zod equivalentes en frontend (feature 011+).
- Modelos internos de servicios (embeddings, chunking) — viven en `services/`.