# Misión

_Define la razón de ser del proyecto. Es la referencia que decide si una feature "encaja" o no._

## Qué construimos

Una aplicación web para **bibliotecas personales inteligentes**: gestiona tu colección de libros, toma notas de lectura con soporte Markdown, y conversa con tu biblioteca mediante IA (RAG + contexto de libro) usando streaming en tiempo real.

Piezas principales:

1. **Backend FastAPI** — API REST + WebSocket/SSE para chat IA, lookup ISBN, CRUD libros/notas, vectorización automática de notas con pgvector.
2. **Frontend Next.js + Tailwind + shadcn/ui** — Dashboard biblioteca, ficha de libro, editor de notas, chat IA dual (contexto libro / RAG global).
3. **Supabase (PostgreSQL + pgvector + Auth)** — Persistencia, autenticación (Google + Email), búsqueda semántica HNSW, RLS por usuario.
4. **MCP Server (Python, FastMCP)** — Expone herramientas para que agentes externos consulten/creen libros y notas, y chateen con la biblioteca.

## Para quién

- **Lectores activos** que quieren organizar su biblioteca, tomar notas estructuradas y "hablar" con sus libros para recuperar ideas, resumir, comparar o explorar conexiones.
- **Desarrolladores / entusiastas IA** que quieren integrar su biblioteca personal con agentes vía MCP (Claude, Cursor, etc.).
- **Equipo EducAI** — base para futuras features educativas (recomendaciones, planes de lectura, análisis de progreso).

## Principios

- **Local-first, cloud-synced** — Los datos son del usuario; Supabase solo sincroniza y habilita búsqueda vectorial. Sin vendor lock-in en la lógica de negocio.
- **Privacidad por defecto** — RLS obliga a que cada usuario solo vea/edite sus datos. No hay datos compartidos salvo features explícitas futuras.
- **Streaming-first UX** — El chat IA nunca bloquea la UI; usa SSE nativo para tokens progresivos. Cero "spinners eternos".
- **ISBN como llave maestra** — El alta de libro empieza por ISBN; metadatos vienen de Open Library / Google Books. Nada de entrada manual propensa a errores.
- **Especificación antes que código** — Ningún cambio toca producción sin spec → plan → tasks → implementación → revisión (SDD).

## Qué NO es

- **No es Goodreads / StoryGraph** — No hay red social, reseñas públicas, seguimiento de amigos, desafíos de lectura ni gamificación.
- **No es un lector de ebooks** — No renderiza EPUB/PDF; solo gestiona metadatos y notas de texto.
- **No es un agente autónomo** — La IA responde a consultas del usuario; no ejecuta tareas en background sin supervisión (salvo vectorización de notas, que es determinista).
- **No es multi-tenant SaaS** — Cada usuario tiene su instancia aislada en Supabase; no hay panel de admin ni facturación.