# 019 · MCP Server

**Estado:** propuesta

## Qué hace

Implementa un servidor MCP (Model Context Protocol) en `apps/mcp/` usando `FastMCP` (Python), exponiendo 5 tools para que agentes externos (Claude, Cursor, etc.) interactúen con la biblioteca del usuario.

Tools:
1. `search_books(query: str) -> List[BookSummary]` — busca en `books` del usuario (ILIKE title/autors), retorna `id, title, authors[], status, rating`.
2. `get_book_notes(book_id: str) -> List[NoteSummary]` — retorna notas del libro (`chunk_index=0`): `id, content, created_at`.
3. `chat_with_library(query: str, book_id?: str) -> str` — proxy al endpoint `/api/v1/ai/chat` (backend) o reimplementa lógica RAG/book-context; retorna respuesta completa (no streaming, MCP tools no streamean).
4. `create_book(isbn: str) -> BookSummary` — llama `ISBNLookupService` + `POST /api/v1/books` (o SQL directo con service_role); retorna libro creado.
5. `create_note(book_id: str, content: str) -> NoteSummary` — `POST /api/v1/books/{id}/notes`; retorna nota creada (vectorización se dispara en background).

Transporte: STDIO (estándar MCP). Configuración via env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `API_BASE_URL` (para llamar a backend HTTP si se prefiere proxy).

## Por qué

MCP abre la biblioteca a agentes IA externos: "Pregúntale a mi biblioteca desde Claude", "Añade este libro desde Cursor". STDIO es transporte nativo para integración local. Reusar lógica backend (services, RPC) evita duplicación.

## Criterios de aceptación

- [ ] `apps/mcp/server.py`: `FastMCP("bookshelf")` + 5 tools decoradas `@mcp.tool()`.
- [ ] Tools usan cliente Supabase `service_role` (bypass RLS) + `user_id` fijo configurable via env `MCP_USER_ID` (single-user MCP) — o multi-usuario via OAuth token en contexto MCP (avanzado, v2).
- [ ] `search_books`: `supabase.table('books').select('id,title,authors,status,rating').ilike('title', f'%{query}%').eq('user_id', MCP_USER_ID).execute()`.
- [ ] `get_book_notes`: verifica ownership → `.select('id,content,created_at').eq('book_id', book_id).eq('chunk_index', 0)`.
- [ ] `chat_with_library`: reusa `services/chat.py` (lógica dual book/rag) o llama `httpx.AsyncClient.post(f"{API_BASE_URL}/api/v1/ai/chat", json=...)` y aguarda respuesta completa (no stream).
- [ ] `create_book`: reusa `ISBNLookupService.lookup()` + `supabase.table('books').insert({...user_id: MCP_USER_ID})`.
- [ ] `create_note`: `supabase.table('book_notes').insert({...user_id: MCP_USER_ID, chunk_index: 0})` + dispara vectorización (background task o async fire-and-forget).
- [ ] `pyproject.toml`: deps `fastmcp`, `supabase`, `google-generativeai`, `httpx`, `pydantic`, `pydantic-settings`, `tiktoken`.
- [ ] Tests: mock Supabase + Gemini; verifica cada tool retorna schema correcto.
- [ ] Documentación: `README.md` en `apps/mcp/` con instrucciones para añadir a `claude_desktop_config.json` / `.cursor/mcp.json`.

## Fuera de alcance

- Autenticación multi-usuario en MCP (OAuth, tokens dinámicos) — single-user via env para MVP.
- Streaming en tools MCP (no soportado por protocolo actual).
- Tools de lectura/escritura de conversaciones de chat.
- Despliegue MCP como servicio (Docker, Railway) — STDIO local para desarrollo.
- Rate limiting / quota en MCP.