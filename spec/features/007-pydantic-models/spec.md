# 007 · Pydantic Models

**Estado:** hecho

## Qué hace

Define los modelos Pydantic v2 para la API FastAPI (request/response) cubriendo Books, Notes, AI Chat y Recommendations. Todos los modelos viven en `app/schemas/` y usan `ConfigDict(from_attributes=True, populate_by_name=True)`. Los modelos siguen convención `snake_case` en Python y `camelCase` en TypeScript generado por OpenAPI.

### Modelos de Books

- **BookMetadata**: Metadatos normalizados de un libro. Campos: `isbn` (str, normalizado 13 dígitos), `title` (str), `authors` (str[]), `publisher` (str, nullable), `published_date` (date, nullable), `description` (str, nullable), `page_count` (int, > 0, nullable), `categories` (str[], nullable), `thumbnail_url` (str, nullable), `language` (str, 2 letras ISO 639-1, nullable).

- **BookCreate**: Hereda de `BookMetadata + user_id` (opcional, se inyecta desde auth/JWT). Se usa en `POST /books`.

- **BookRead**: Hereda de `BookCreate + id` (UUID), `created_at` (datetime), `updated_at` (datetime), `user_id` (UUID). Se usa en respuestas `GET /books` y `GET /books/{id}`.

- **BookUpdate**: Campos opcionales de `BookMetadata` (`isbn`, `title`, `authors`, `publisher`, `published_date`, `description`, `page_count`, `categories`, `thumbnail_url`, `language`) + `status` (enum: `want_to_read | reading | read`), `rating` (int, 1-5), `review` (str, nullable). Se usa en `PATCH /books/{id}`.

### Modelos de Notes

- **NoteCreate**: `book_id` (UUID), `content` (str, min 1 char), `page` (int, opcional, > 0). Se usa en `POST /books/{id}/notes`.

- **NoteRead**: Hereda de `NoteCreate + id` (UUID), `user_id` (UUID), `created_at` (datetime), `updated_at` (datetime), `chunk_index` (int[]), `embedding` (float[], dim 768, nullable). Se usa en respuestas `GET /books/{id}/notes`.

### Modelos de AI Chat

- **ChatRequest**: `message` (str, min 1 char, max 4000), `book_id` (UUID, opcional), `mode` (enum: `"book" | "library"`). modo `"book"` inyecta contexto del libro; `"library"` usa RAG global.

- **ChatResponse**: `response` (str), `sources` (str[], opcional, URLs o referencias), `book_id` (UUID, opcional). Incluye metadatos para el frontend.

### Modelos de Recommendations

- **RecommendationResponse**: `recommendations` ([]), cada elemento es un objeto con: `book_title` (str), `author` (str), `reason` (str), `confidence` (float, 0-1). Se usa en `GET /ai/recommendations`.

## Por qué

**Tipado fuerte y validación automática**: Pydantic v2 garantiza que los datos entrantes cumplan el esquema antes de procesarse, evitando datos sucios en la base de datos.

**Serialización JSON y OpenAPI automática**: Un solo origen de verdad para request/response. FastAPI genera la documentación OpenAPI automáticamente, y los tipos TypeScript se generan del schema JSON, mejorando el DX en el frontend Next.js.

**DX en frontend (TypeScript types generados)**: Al usar `ConfigDict(from_attributes=True)`, los modelos pueden ser usados tanto en backend (Python) como en frontend (TypeScript) mediante código de generación o manual, asegurando que la capa de API sea consistente.

**Separación de operaciones**: Tener `BookCreate`, `BookRead`, `BookUpdate` separados permite validaciones y campos distintos por operación (ej. `isbn13` solo en create, campos de solo lectura en read, campos opcionales en update).

**Validaciones de negocio en el schema**: Validaciones como ISBN normalizado (13 dígitos), rating 1-5, page > 0 se definen una vez en el modelo y se aplican en cualquier punto (API, tests, MCP).

## Criterios de aceptación

- [ ] Existe `BookCreate` que hereda de `BookMetadata` + `user_id` opcional, y valida ISBN-13 (regex `^\d{13}$`) y `page_count > 0` cuando se provee.
- [ ] Existe `BookRead` que hereda de `BookCreate + id (UUID) + created_at + updated_at + user_id`.
- [ ] Existe `BookUpdate` con todos los campos de `BookMetadata` opcionales + `status` (enum validado), `rating` (1-5), `review` (str, nullable).
- [ ] Existe `BookMetadata` con todos los campos solicitados: `isbn`, `title`, `authors[]`, `publisher`, `published_date`, `description`, `page_count`, `categories[]`, `thumbnail_url`, `language`.
- [ ] Existe `NoteCreate` con `book_id` (UUID), `content` (str, min 1 char), `page` (int opcional, > 0).
- [ ] Existe `NoteRead` que hereda de `NoteCreate + id + user_id + created_at + updated_at + chunk_index[] + embedding[]`.
- [ ] Existe `ChatRequest` con `message` (str, min 1 char, max 4000), `book_id` UUID opcional, `mode` enum `("book" | "library")`.
- [ ] Existe `ChatResponse` con `response` (str), `sources[]` opcional, `book_id` opcional.
- [ ] Existe `RecommendationResponse` con `recommendations[]` donde cada una tiene `book_title`, `author`, `reason`, `confidence` (0-1).
- [ ] **Todos** los modelos usa `model_config = ConfigDict(from_attributes=True, populate_by_name=True)`.
- [ ] Validaciones activas: ISBN normalizado 13 dígitos, rating 1-5, page > 0 cuando se provee.
- [ ] Ubicación de archivos: `app/schemas/` con nombres `book_metadata.py`, `book_create.py`, `book_read.py`, `book_update.py`, `note_create.py`, `note_read.py`, `chat_request.py`, `chat_response.py`, `recommendation_response.py`.
- [ ] OpenAPI generada (`GET /openapi.json`) incluye todos los schemas sin errores de validación.
- [ ] Tests unitarios: validación happy path + casos inválidos (ISBN malformado, rating 0, page negativo, query vacío, modo inválido).

## Fuera de alcance

- Lógica de negocio (services/, routers, endpoints).
- Modelos de base de datos SQLAlchemy o modelos internos de Supabase (tabla `books`, `book_notes`).
- Migraciones de base de datos (archivos en `supabase/migrations/`).
- Modelos Zod equivalentes en frontend (feature 011+).
- Endpoints API y sus implementaciones (features 008-010, 017).
- Servicios de chunking, embeddings y vectorización (features 016, 018).
- Lógica de streaming SSE o WebSocket (feature 017).