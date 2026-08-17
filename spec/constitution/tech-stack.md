# Tech stack y convenciones

_Cómo está construido el proyecto y las reglas que todo el código debe respetar. Es la referencia técnica que ningún plan de feature debería contradecir._

## Tecnologías

- **Lenguaje:** TypeScript estricto (frontend), Python 3.11+ (backend, MCP)
- **Framework / runtime:**
  - Frontend: Next.js 14+ (App Router), React 18, Tailwind CSS 3, shadcn/ui
  - Backend: FastAPI 0.110+, Uvicorn, Pydantic v2, Pydantic-Settings
  - MCP: FastMCP (Python)
- **Base de datos:** PostgreSQL 16 (Supabase) + pgvector 0.7+, HNSW indexes
- **Autenticación:** Supabase Auth (Google OAuth + Email/Password), JWT en headers
- **IA / Embeddings:** Google Gemini API (`gemini-2.0-flash` para chat, `text-embedding-004` para embeddings)
- **ISBN Lookup:** Open Library API (primario), Google Books API (fallback)
- **Tests:** Vitest + React Testing Library (frontend), pytest + httpx (backend), pytest-asyncio
- **Lint/Format:** ESLint + Prettier (frontend), Ruff + Black (backend)
- **Despliegue:** Vercel (Next.js), Render (FastAPI Docker), Supabase (managed PG)
- **CI/CD:** GitHub Actions (lint, test, build, deploy preview)

## Archivos / módulos clave

```
bookshelf/
├── apps/
│   ├── web/                    # Next.js frontend
│   │   ├── src/
│   │   │   ├── app/            # App Router pages (layout, dashboard, book/[id], login)
│   │   │   ├── components/     # UI components (shadcn + custom)
│   │   │   ├── lib/            # Supabase clients, utils, hooks
│   │   │   └── types/          # Shared TypeScript types
│   │   └── package.json
│   ├── api/                    # FastAPI backend
│   │   ├── app/
│   │   │   ├── core/           # config, security, lifespan, logging
│   │   │   ├── api/v1/         # Routers: books, notes, ai, lookup
│   │   │   ├── services/       # ISBN lookup, embeddings, vectorization, chat
│   │   │   ├── models/         # Pydantic request/response models
│   │   │   └── db/             # Supabase client, migrations helpers
│   │   ├── pyproject.toml
│   │   └── Dockerfile
│   └── mcp/                    # MCP Server (FastMCP)
│       ├── server.py
│       ├── tools/              # search_books, get_book_notes, chat_with_library, create_book, create_note
│       └── pyproject.toml
├── supabase/
│   └── migrations/             # SQL migrations (001_init, 002_rls, 003_rpc, etc.)
├── .env.example                # Template de variables de entorno
├── docker-compose.yml          # Local dev stack (opcional)
└── AGENTS.md
```

## Comandos

- **Dev frontend:** `cd apps/web && npm run dev` (puerto 3000)
- **Dev backend:** `cd apps/api && uvicorn app.main:app --reload` (puerto 8000)
- **Dev MCP:** `cd apps/mcp && python server.py` (STDIO)
- **Test frontend:** `cd apps/web && npm run test` (Vitest)
- **Test backend:** `cd apps/api && pytest -v`
- **Test MCP:** `cd apps/mcp && pytest -v`
- **Lint frontend:** `cd apps/web && npm run lint` (ESLint)
- **Lint backend:** `cd apps/api && ruff check . && black --check .`
- **Build frontend:** `cd apps/web && npm run build`
- **Build backend:** `cd apps/api && docker build -t bookshelf-api .`
- **Migrations:** `cd apps/api && python -m alembic upgrade head` (o aplica SQL directo en Supabase Dashboard)

## Modelo de datos / dominio

### Tabla `books`
| Campo | Tipo | Reglas |
|-------|------|--------|
| `id` | `uuid` | PK, `gen_random_uuid()` |
| `user_id` | `uuid` | FK → `auth.users(id)`, NOT NULL, RLS |
| `isbn13` | `char(13)` | UNIQUE por user_id, CHECK `length(isbn13)=13 AND isbn13 ~ '^\d{13}$'` |
| `title` | `text` | NOT NULL |
| `authors` | `text[]` | NOT NULL, default `'{ }'` |
| `cover_url` | `text` | nullable |
| `page_count` | `int` | nullable, CHECK `page_count > 0` |
| `publisher` | `text` | nullable |
| `published_date` | `date` | nullable |
| `description` | `text` | nullable |
| `status` | `enum` | `book_status` = `want_to_read | reading | read`, default `want_to_read` |
| `rating` | `smallint` | nullable, CHECK `rating BETWEEN 1 AND 5` |
| `started_at` | `date` | nullable |
| `finished_at` | `date` | nullable |
| `created_at` | `timestamptz` | NOT NULL, default `now()` |
| `updated_at` | `timestamptz` | NOT NULL, default `now()`, trigger `set_updated_at` |

### Tabla `book_notes`
| Campo | Tipo | Reglas |
|-------|------|--------|
| `id` | `uuid` | PK, `gen_random_uuid()` |
| `user_id` | `uuid` | FK → `auth.users(id)`, NOT NULL, RLS |
| `book_id` | `uuid` | FK → `books(id)` ON DELETE CASCADE, NOT NULL |
| `content` | `text` | NOT NULL, contenido original Markdown |
| `content_html` | `text` | NOT NULL, renderizado HTML (para búsqueda/preview) |
| `chunk_index` | `int` | NOT NULL, índice del chunk en la nota original (0 = nota completa si no se chunkea) |
| `embedding` | `vector(768)` | NOT NULL, `text-embedding-004` (768 dims) |
| `created_at` | `timestamptz` | NOT NULL, default `now()` |

### RPC `match_book_notes`
```sql
match_book_notes(
  query_embedding vector(768),
  filter_user_id uuid,
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10
) RETURNS SETOF record (note_id uuid, book_id uuid, book_title text, chunk_index int, content text, similarity float)
```

### Enums
- `book_status`: `want_to_read`, `reading`, `read`

### Triggers
- `set_updated_at` en `books` → actualiza `updated_at = now()` en UPDATE

## Convenciones

- **Nombres:** `snake_case` en SQL/Python, `camelCase` en TypeScript, `PascalCase` para componentes React y clases.
- **Tests:** Junto al archivo: `foo.ts` + `foo.test.ts` (frontend), `test_foo.py` (backend).
- **Validación:** Pydantic v2 en backend (request/response), Zod en frontend (forms, API responses).
- **Errores:** Backend → `HTTPException` con `detail` estructurado (`{ code, message, field? }`). Frontend → `try/catch` + toast, errores de validación en línea.
- **Autenticación:** Backend usa `Depends(get_current_user)` → extrae `user_id` del JWT verificado contra Supabase. Supabase client server-side usa `service_role` key para bypass RLS en operaciones de sistema (vectorización).
- **Variables de entorno:** `.env.example` documenta todas; `.env.local` en local (gitignored). Nunca commitear secretos.
- **Streaming:** SSE nativo (`text/event-stream`), chunk = `data: { "chunk": "..." }\n\n`. Frontend usa `EventSource` o `fetch` + `ReadableStream`.
- **Chunking notas:** ~500 tokens / 50 overlap (tiktoken `cl100k_base` o similar). Cada chunk → fila en `book_notes` con `chunk_index` incremental.
- **Rate limiting ISBN:** Open Library sin key = 100 req/min. Cache en memoria (TTL 1h) + fallback a Google Books.

## Estilo visual

- **Sistema de color:** shadcn/ui default (CSS variables, dark mode via `class` strategy). Primary: blue-600, Accent: amber-500 (rating stars).
- **Tipografías:** Inter (UI), JetBrains Mono (código/Markdown), system-ui fallback.
- **Layout:** Dashboard grid responsive: 1 col (<640px), 2 col (640-1024px), 3 col (1024-1280px), 4 col (>1280px).
- **Breakpoints:** Tailwind defaults (sm/md/lg/xl/2xl).
- **Componentes base:** shadcn/ui (Button, Card, Dialog, Tabs, Select, Textarea, Avatar, Badge, Skeleton, Toast).

## Límites duros

- **No añadir dependencias** sin justificación en PR (revisión de `package.json` / `pyproject.toml`).
- **No tocar `supabase/migrations/`** después de aplicadas; nueva migración = nuevo archivo numerado.
- **No usar `service_role` key en frontend**; solo en backend/MCP para operaciones de sistema.
- **No subir `.env*`, `.env.local`, `*.key`, `*.pem`** al repo (gitignore estricto).
- **No hardcodear URLs de Supabase**; siempre `process.env.NEXT_PUBLIC_SUPABASE_URL` / `settings.supabase_url`.
- **No hacer queries SQL raw en frontend**; todo vía API backend o Supabase client (browser) con RLS.
- **Chunking fijo:** 500 tokens / 50 overlap. Cambiar requiere migración de embeddings existentes.
- **Embedding model fijo:** `text-embedding-004` (768 dims). Cambio = re-vectorización completa.
- **Una feature "en curso" a la vez** (Regla 0 SDD). El orquestador lo bloquea.