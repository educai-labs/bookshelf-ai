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
17. **017 · Dual AI Chat SSE** — POST `/api/v1/ai/chat` streaming SSE: modo libro (contexto completo → modelo configurable, default `gemini-3.5-flash`) y modo RAG (embedding → RPC `match_book_notes` threshold 0.7 count 10 → stream). Frontend `/chat` con fetch+ReadableStream, markdown sanitizado (DOMPurify) e historial en sessionStorage.
18. **021 · Server Config** — Config centralizada del servidor (Pydantic-Settings en `apps/api/app/core/config.py`): entorno, Supabase, IA, CORS, servicios externos, logs, seguridad. Secretos nunca al frontend ni a logs; fail-fast en producción.
19. **022 · Client Settings** — Preferencias del cliente (tema, idioma es/en con i18n completo de la UI 011–017, lector, chat, notificaciones, privacidad, accesibilidad) en un único módulo/contexto. Persistencia localStorage/DB/sessionStorage; endpoints backend validan prefs de cuenta. Prerrequisito de 020.
20. **023 · Search Suggestions** — Typeahead en vivo por título/autor/ISBN en el buscador del dashboard (013) y el modal de alta (014); endpoint nuevo `GET /api/v1/books/suggestions` con merge de biblioteca + catálogo externo (008 extendido), debounce 300ms, mín 3 chars, máx 8 sugerencias, dedup por ISBN13 y fail-soft a biblioteca.
21. **024 · Schema Migration Verification** — `npm run verify:schema` valida el esquema remoto objeto a objeto (tablas `books`/`book_notes`/`account_preferences`, RPC `match_book_notes`, extensión `vector`, índice HNSW) con exit 0/1 y mapea `PGRST205`/`PGRST202` → 503 `DB_MIGRATION_MISSING` accionable; convención SDD de aplicar y verificar migraciones con evidencia.
22. **025 · ISBN Lookup Fallback (search.json)** — Fallback intermedio en `ISBNLookupService.buscar()` (008) a `openlibrary.org/search.json?q=isbn:<isbn>` —misma fuente que 023— cuando `/api/books` no devuelve metadatos completos, antes de Google Books. Reutiliza caché 1 h, timeout y reintentos existentes; `published_date` desde `first_publish_year`. Corrige 404s de ISBNs existentes (ej. 9780684838724) que cortaban el alta del modal 014; `GET /lookup` y `POST /books` (009) lo heredan sin cambios de contrato.

## Siguiente 🔜

_Lo próximo a abordar. Idealmente una sola feature "en curso" a la vez._

## Backlog / ideas 💡

_Sin comprometer ni ordenar del todo. Ideas que respetan la constitución._

- **018 · AI Recommendations** — GET `/api/v1/ai/recommendations` → prompt con historial (títulos, ratings, temas de notas) → 5 sugerencias con justificación. Modelo estructurado.
- **019 · MCP Server** — `FastMCP` server Python. Tools: `search_books`, `get_book_notes`, `chat_with_library`, `create_book`, `create_note`. STDIO transport. Auth via env vars.
- **020 · Production Deployment** — Vercel (Next.js): env vars, preview deployments, custom domain, edge config. Render (FastAPI): Dockerfile, health check `/health`, autoscaling, env vars, managed PG (Supabase). CI/CD GitHub Actions.

> Cada feature nueva se crea como `features/NNN-nombre-feature/` con `spec.md`, `plan.md` y `tasks.md` antes de tocar código.