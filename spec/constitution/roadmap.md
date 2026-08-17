# Roadmap

_Orden y estado de las features. Es la vista de "qué hay hecho, qué toca ahora y qué viene". Cada entrada apunta a su carpeta en `features/._

## Hecho ✅
- 001 · Supabase Project Setup — **Hecho** 2026-08-17
- 002 · DB Schema Books & Notes — **Hecho** 2026-08-17
- 003 · pgvector + HNSW Indexes — **Hecho** 2026-08-17

## Siguiente 🔜

_Lo próximo a abordar. Idealmente una sola feature "en curso" a la vez._



4. **004 · RLS Policies** — `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`; policies `auth.uid() = user_id` en `books` y `book_notes` (ALL).
5. **005 · RPC match_book_notes** — Función PL/pgSQL: similitud coseno, filtro `user_id`, threshold, limit, join `books` para título.
6. **006 · FastAPI Scaffold** — Estructura `app/{core,api/v1,services,models,db}`; lifespan, CORS, logging, settings, health check.
7. **007 · Pydantic Models** — Modelos request/response: BookCreate/Read/Update, BookMetadata, NoteCreate/Read, ChatRequest, ChatResponse, RecommendationResponse.
8. **008 · ISBN Lookup Service** — `ISBNLookupService` async con `httpx.AsyncClient`; Open Library primario, Google Books fallback; normaliza a `BookMetadata`.
9. **009 · Books CRUD API** — 6 endpoints: lookup, create, list, get, update, delete. Validación Pydantic, auth dependency (JWT → user_id), RLS via Supabase server-side.
10. **010 · Notes CRUD API** — GET `/books/{id}/notes` (paginado), POST `/books/{id}/notes` (crea + dispara vectorización background). Auth + ownership check.
11. **011 · Next.js UI Scaffold** — `create-next-app` TS + Tailwind + shadcn/ui; Supabase client (browser + server); SessionProvider; layout base.
12. **012 · Auth UI + Middleware** — `/login`, `/register`; Google OAuth flow; protected routes middleware (redirige a login); logout.
13. **013 · Dashboard Library Grid** — Grid responsive cards (portada, título, autor, status badge, rating stars); filtros: status tabs, rating select, búsqueda texto debounced 300ms; skeleton loading; empty state.
14. **014 · Add Book Modal + ISBN** — Modal input ISBN → `GET /api/v1/books/lookup?isbn=` → preview metadatos → "Guardar" → `POST /api/v1/books` → refresh grid.
15. **015 · Book Detail / Reading Sheet** — `/book/[id]`: portada grande, metadatos, selector status, rating 1-5, editor Markdown (textarea + preview), lista notas con timestamp. "Guardar nota" → POST notes.
16. **016 · Note Vectorization Pipeline** — Al crear nota: chunking ~500 tokens / 50 overlap (tiktoken); batch embeddings `text-embedding-004`; upsert `book_notes` con `chunk_index` + `embedding`. Background task.
17. **017 · Dual AI Chat SSE** — POST `/api/v1/ai/chat` streaming SSE. Modo `book_id`: inyecta libro + notas completas → `gemini-2.0-flash`. Modo sin `book_id`: embedding query → RPC `match_book_notes` (threshold 0.7, count 10) → stream. Frontend `EventSource` / fetch+ReadableStream.

## Backlog / ideas 💡

_Sin comprometer ni ordenar del todo. Ideas que respetan la constitución._

- **018 · AI Recommendations** — GET `/api/v1/ai/recommendations` → prompt con historial (títulos, ratings, temas de notas) → 5 sugerencias con justificación. Modelo estructurado.
- **019 · MCP Server** — `FastMCP` server Python. Tools: `search_books`, `get_book_notes`, `chat_with_library`, `create_book`, `create_note`. STDIO transport. Auth via env vars.
- **020 · Production Deployment** — Vercel (Next.js): env vars, preview deployments, custom domain, edge config. Render (FastAPI): Dockerfile, health check `/health`, autoscaling, env vars, managed PG (Supabase). CI/CD GitHub Actions.

> Cada feature nueva se crea como `features/NNN-nombre-feature/` con `spec.md`, `plan.md` y `tasks.md` antes de tocar código.