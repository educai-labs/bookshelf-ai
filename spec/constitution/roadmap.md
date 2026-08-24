# Roadmap

_Orden y estado de las features. Cada entrada apunta a su carpeta en `features/._

## Hecho ✅

1. **001 · Supabase Project Setup** — Setup Supabase project
2. **002 · DB Schema Books & Notes** — DB schema for books and notes
3. **003 · pgvector + HNSW Indexes** — pgvector and HNSW indexes
4. **004 · RLS Policies** — RLS policies for books and book_notes tables
5. **005 · RPC match_book_notes** — RPC for matching book notes
6. **006 · FastAPI Scaffold** — FastAPI scaffold
7. **007 · Pydantic Models** — Pydantic models
8. **008 · ISBN Lookup Service** — ISBN Lookup Service with httpx.AsyncClient; Open Library primary, Google Books fallback; normalizes to `BookMetadata`.
9. **009 · Books CRUD API** — 6 endpoints: lookup, create, list, get, update, delete. Validación Pydantic, auth dependency (JWT → user_id), RLS via Supabase server-side
10. **010 · Notes CRUD API** — GET `/books/{id}/notes` (paginado), POST `/books/{id}/notes` (crea + dispara vectorización background). Auth + ownership check.
11. **011 · Next.js UI Scaffold** — `create-next-app` TS + Tailwind + shadcn/ui; Supabase client (browser + server); SessionProvider; layout base; route groups `(auth)` y `(dashboard)`.
12. **012 · Auth UI + Middleware** — `/login`, `/register`; Google OAuth flow; protected routes middleware (redirige a login); logout.
13. **013 · Dashboard Library Grid** — Implementa la vista principal `/dashboard` con grid responsivo de tarjetas de libros ("Library Grid").
14. **014 · Add Book Modal + ISBN** — Modal de alta por ISBN (normalización, lookup → preview → guardar, errores 400/404/409/500 con toast), integrado en DashboardHeader y EmptyState.
15. **015 · Book Detail / Reading Sheet** — ficha completa de libro + editor de notas
16. **016 · Note Vectorization Pipeline** — Pipeline async al crear nota: chunking tiktoken ~500 tokens/50 overlap; batch embeddings `text-embedding-004`; upsert idempotente en `book_notes` con `chunk_index` + `embedding`. Background task.

## Siguiente 🔜

_Lo próximo a abordar. Idealmente una sola feature "en curso" a la vez._

- **017 · Dual AI Chat SSE** — POST `/api/v1/ai/chat` streaming SSE. Modo `book_id`: inyecta libro + notas completas → `gemini-2.0-flash`. Modo sin `book_id`: embedding query → RPC `match_book_notes` (threshold 0.7, count 10) → stream. Frontend `EventSource` / fetch+ReadableStream.

## Backlog / ideas 💡

_Sin comprometer ni ordenar del todo. Ideas que respetan la constitución._

- **018 · AI Recommendations** — GET `/api/v1/ai/recommendations` → prompt con historial (títulos, ratings, temas de notas) → 5 sugerencias con justificación. Modelo estructurado.
- **019 · MCP Server** — `FastMCP` server Python. Tools: `search_books`, `get_book_notes`, `chat_with_library`, `create_book`, `create_note`. STDIO transport. Auth via env vars.
- **020 · Production Deployment** — Vercel (Next.js): env vars, preview deployments, custom domain, edge config. Render (FastAPI): Dockerfile, health check `/health`, autoscaling, env vars, managed PG (Supabase). CI/CD GitHub Actions.

> Cada feature nueva se crea como `features/NNN-nombre-feature/` con `spec.md`, `plan.md` y `tasks.md` antes de tocar código.