# Changelog

Todos los cambios notables del proyecto se documentan en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es/1.1.0/) y este proyecto
usa [Semantic Versioning](https://semver.org/lang/es/).

## [Unreleased]

### Añadido

- **001**: Supabase Setup — extensión `pgvector` habilitada (migración `20260815185301_enable_pgvector.sql`), credenciales documentadas en `docs/supabase-setup.md`, scripts de verificación `verify:supabase`.
- **002**: DB Schema Books & Notes — migración `002_books_notes.sql` aplicada. Tabla `books` y `book_notes` creadas con constraints, enum `book_status`, trigger `updated_at` e índices de apoyo.
- **003**: pgvector + HNSW — migración `003_pgvector_hnsw.sql`: índice HNSW `idx_book_notes_embedding_hnsw` sobre `book_notes.embedding` (coseno, m=16, ef_construction=64).
- **004**: RLS Policies — migración `004_rls_policies.sql`: RLS habilitado en `books` y `book_notes` con aislamiento por `auth.uid() = user_id`.
- **005**: RPC `match_book_notes` — migración `005_rpc_match_book_notes.sql`: búsqueda semántica por coseno (`<=>`) con threshold y count.
- **006**: FastAPI Scaffold — app `bookshelf-api` con lifespan, CORS, logging structlog, excepción handlers estructurados y Dockerfile multi-stage.
- **007**: Pydantic Models — modelos request/response del dominio (book, note, chat, recommendation).
- **008**: ISBN Lookup Service — Open Library primario, Google Books fallback, caché TTL 1h, reintentos.
- **009**: Books CRUD API — 6 endpoints REST con JWT y filtros (status, rating, búsqueda título/autor).
- **010**: Notes CRUD API — crear/listar notas, render Markdown→HTML sanitizado, vectorización en background (stub).
- **011**: Next.js UI Scaffold — Next.js 14 + Tailwind + shadcn/ui, clientes Supabase browser/server, layout y route groups.
- **012**: Auth UI + Middleware — login/registro, Google OAuth, rutas protegidas, logout.
- **013**: Dashboard Library Grid — grid responsivo con filtros, búsqueda y paginación.
- **014**: Add Book Modal + ISBN — alta por ISBN con normalización, lookup→preview→guardar y manejo de errores.
- **015**: Book Detail / Reading Sheet — ficha completa con controles de lectura, editor de notas Markdown y chat placeholder.
- **016**: Note Vectorization Pipeline — pipeline asíncrono de vectorización de notas: chunking `tiktoken` (`cl100k_base`, 500 tokens / 50 overlap), embeddings batch `text-embedding-004` (768 dims) vía `google.generativeai`, y sustitución idempotente de chunks en `book_notes` (DELETE → INSERT → UPDATE) con cliente `service_role`.
- **017**: Dual AI Chat SSE — endpoint `POST /api/v1/ai/chat` con streaming SSE (`text/event-stream`): modo `book` (contexto libro con notas completas, ownership validado) y modo `rag` (RAG global vía RPC `match_book_notes` + embedding `text-embedding-004`), `gemini-2.0-flash` aislado del event loop en worker, timeout total de 60s y errores como eventos SSE sin secretos. Frontend `/chat` con render Markdown sanitizado (`marked` + DOMPurify), consumo incremental del `ReadableStream` e historial en `sessionStorage`.

### Corregido

- Ficha de libro (`/book/[id]`): los fetch del Server Component usaban URL relativa (`Failed to parse URL`); ahora usan `API_URL` absoluto.

### Cambiado

- Consolidación de modelos backend: `app/schemas/` (feature 007) eliminado; `BookStatus` movido a `app/models/enums.py` y los endpoints documentan sus modelos reales (`app/models/`).
- Limpieza de código muerto backend (cliente HTTP sin uso, `ISBNRequest`, `app/db`, normalizadores duplicados) y frontend (tipos triplicados, `AddBookModal` huérfano, `tooltip`, `queryKeys`, validaciones vacías).
- Calendario de fechas real (`react-day-picker`) y estilos tipográficos (`@tailwindcss/typography`).
- Refresco de la ficha de libro tras crear nota o cambiar estado/rating (`router.refresh()`).
- Healthcheck del Dockerfile sin `curl` (usando Python/urllib); cache del cliente JWKS; guards de skip en los tests RLS.