# 019 · MCP Server

**Estado:** hecho

## Qué hace

Servidor MCP (Model Context Protocol) **local y monousuario** en `apps/mcp/` (Python + FastMCP, transporte STDIO) que expone la biblioteca del usuario a agentes IA externos (Claude Desktop, Cursor, etc.) mediante 5 tools:

1. `search_books(query)` — libros del usuario cuyo título o autores coinciden con `query` (sin distinguir mayúsculas); devuelve `id, title, authors[], status, rating`.
2. `get_book_notes(book_id)` — notas completas del libro (`chunk_index = 0`): `id, content, created_at`.
3. `chat_with_library(query, book_id?)` — respuesta **completa** (sin streaming, limitación del protocolo MCP): con `book_id` responde en modo libro (contexto del libro y sus notas); sin `book_id` responde en modo RAG sobre toda la biblioteca.
4. `create_book(isbn)` — crea el libro con los metadatos del lookup ISBN y devuelve su resumen.
5. `create_note(book_id, content)` — crea la nota en Markdown, devuelve la nota creada y deja la vectorización en cola.

**Acceso a datos (decisión de arquitectura fijada por el usuario):** el servidor se conecta a Supabase con la `service_role` key y **filtra siempre** por el `user_id` indicado en la variable de entorno `MCP_USER_ID`. **No existe proxy HTTP obligatorio hacia `apps/api`**: las tools reutilizan **por import** la lógica ya construida en el backend (servicios de chat, lookup ISBN y vectorización), de modo que el servidor MCP funciona aunque el backend no esté levantado.

**Arranque:** antes de exponer ninguna tool, el servidor valida sus variables de entorno y, si faltan o son inválidas, termina con un mensaje claro que nombra la variable problemática **sin volcar ningún secreto**.

Configuración por env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `MCP_USER_ID` (obligatorias); `GOOGLE_BOOKS_API_KEY` (opcional, fallback del lookup ISBN).

## Por qué

MCP abre la biblioteca a agentes externos: "pregúntale a mi biblioteca desde Claude", "añade este libro desde Cursor", "pasa mis notas a mi library". Al ser una herramienta que corre en la máquina del propio usuario, STDIO local es el transporte natural y no obliga a tener el backend corriendo ni a exponer la API.

Reutilizar los servicios existentes por import, en lugar de reimplementarlos, evita la **divergencia**: el chat, el lookup ISBN y la vectorización se comportan exactamente igual desde la web que desde MCP, y una corrección en `apps/api` llega a ambos caminos.

**Tradeoff declarado explícitamente:** `service_role` **bypassea RLS**. Se acepta porque el servidor es una herramienta **local y monousuario** que solo toca la instancia del propio usuario y se configura con su `MCP_USER_ID`; el aislamiento deja de estar garantizado por la base de datos y pasa a ser responsabilidad del código de cada tool (filtro explícito por `user_id` en toda lectura y escritura). Como contrapartida obligatoria, la clave **nunca** se registra en logs ni aparece en mensajes de error. Cualquier escenario multiusuario queda **fuera de alcance** (ver abajo).

## Criterios de aceptación

### Alcance y arquitectura de acceso a datos

- [ ] `apps/mcp/` contiene un servidor FastMCP que se arranca con `cd apps/mcp && python server.py` (STDIO) y expone exactamente las 5 tools: `search_books`, `get_book_notes`, `chat_with_library`, `create_book`, `create_note`.
- [ ] El servidor funciona **sin** que `apps/api` esté en ejecución y sin que se le configure ninguna URL de backend: ninguna tool hace llamadas HTTP a la API (no existe `API_BASE_URL` en su configuración).
- [ ] Las tools leen y escriben en Supabase con la `service_role` key y **filtran siempre** por el `user_id` de `MCP_USER_ID`: en una prueba con datos de dos usuarios, ninguna tool devuelve ni modifica filas del otro usuario.
- [ ] `MCP_USER_ID` es configurable solo por entorno (sin cambiar código) y todas las tools respetan el usuario configurado, tanto en lecturas como en inserciones (`user_id` en las filas creadas).

### Comportamiento de las tools

- [ ] `search_books` devuelve solo `id, title, authors[], status, rating` de los libros del usuario cuyo título o autores coinciden con `query` sin distinguir mayúsculas; una coincidencia inexistente devuelve lista vacía (no error); un `query` vacío o de solo espacios devuelve error de validación estructurado.
- [ ] `get_book_notes` devuelve únicamente las filas con `chunk_index = 0` del libro indicado (`id, content, created_at`), ordenadas por `created_at` descendente, y **solo** si el libro pertenece a `MCP_USER_ID`; si el `book_id` no existe o es de otro usuario, devuelve error estructurado y ninguna nota.
- [ ] `chat_with_library` acepta `book_id` opcional: con `book_id` usa el modo libro (017); sin `book_id` usa el modo RAG global (misma RPC y umbrales que la web).
- [ ] `chat_with_library` devuelve la **respuesta completa** en un único resultado de text (no streaming, no tokens parciales, no eventos), aunque la lógica subyacente genere tokens progresivos.
- [ ] `chat_with_library` ante fallo del modelo, timeout o `book_id` ajeno/inexistente devuelve un error estructurado y no una respuesta vacía confundible con éxito.
- [ ] `create_book` normaliza el ISBN (10/13), obtiene metadatos con el mismo comportamiento de lookup de 008/025 y crea el libro para `MCP_USER_ID` devolviendo su resumen (`id, title, authors[], status, rating`); ISBN malformado → error de validación; metadatos no encontrados → error "no encontrado"; ISBN ya en la biblioteca del usuario → error "ya existe" y **ninguna fila duplicada**.
- [ ] `create_note` crea la nota del libro conservando el Markdown original, devuelve `id, content, created_at` y deja la nota lista para ser recuperada después por `get_book_notes`; la vectorización se dispara con el pipeline de 016 (chunking + embeddings) sin reimplementar chunking ni modelo de embeddings.
- [ ] `create_note` con `book_id` inexistente o de otro usuario devuelve error estructurado y no inserta la nota.

### Reutilización de lógica del backend

- [ ] La lógica de chat (prompts y flujo libro/RAG), el lookup ISBN y la vectorización se consumen **por import** de los servicios de `apps/api`; en `apps/mcp` no hay copias de prompts, de funciones de chunking, ni llamadas propias duplicadas a Gemini/Open Library/Google Books.
- [ ] Si un servicio de `apps/api` no es importable tal cual, existe un **adaptador mínimo** en `apps/mcp` y su existencia está documentada (qué se adapta y por qué), limitándose a la capa de conexión y no duplicando reglas de negocio.

### Validación de arranque y manejo de errores

- [ ] Al arrancar, el servidor valida `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY` y `MCP_USER_ID` (URL y formato/UUID cuando aplique); si falta o es inválida, termina con mensaje que indica el **nombre** de la variable y qué se espera de ella, y no levanta las tools.
- [ ] El mensaje de fallo de arranque, los logs y cualquier error devuelto a lo largo del ciclo de vida **no contienen** el valor de `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `GOOGLE_BOOKS_API_KEY` ni ningún token.
- [ ] Cada tool devuelve fallos como error estructurado (código + mensaje legible), sin stack traces ni texto crudo de excepción ni detalles de conexión expuestos al agente.

### Esquemas

- [ ] Las 5 tools declaran esquema de **entrada** y de **salida** con Pydantic (tipos explícitos, campos opcionales marcados como tales —`book_id` en `chat_with_library`, `rating`/`status` nulables—), y las respuestas reales validan contra esos esquemas.

### Documentación obligatoria

- [ ] `apps/mcp/README.md` incluye: ejemplo de `claude_desktop_config.json`, ejemplo de `.cursor/mcp.json`, tabla de variables de entorno (obligatorias y opcionales) con su propósito, y cómo arrancar el servidor localmente.
- [ ] `apps/mcp/README.md` incluye una **advertencia de seguridad** que declare explícitamente que el servidor usa `service_role` (bypassea RLS), que es monousuario local y que la clave debe mantenerse privada y fuera de logs/repositorio.

### Validación automática

- [ ] Hay tests en `apps/mcp` con mocks de Supabase y de Gemini que cubren como mínimo: camino feliz de las 5 tools; aislamiento por `MCP_USER_ID` (dos usuarios); `book_id` ajeno o inexistente; ISBN inválido / no encontrado / duplicado; validación de env al arrancar sin secretos en la salida; y error estructurado (sin stack trace) cuando falla una dependencia.
- [ ] `cd apps/mcp && pytest -v` pasa al 100%.
- [ ] `cd apps/mcp && ruff check . && black --check .` pasa sin warnings ni archivos por formatear.

### No regresión

- [ ] La feature no modifica `apps/web`, no cambia el comportamiento de `apps/api` para la app web y no toca `supabase/migrations/`.
- [ ] La única dependencia de terceros **nueva** que introduce la feature es `fastmcp`; el resto son paquetes ya empleados por el backend (`supabase`, `google-generativeai`, `pydantic`, `httpx`, `tiktoken`). No se añade ninguno adicional.

## Fuera de alcance

- **Autenticación multiusuario en MCP** (OAuth, tokens por sesión, servidor por cliente). Queda en Backlog como feature nueva si se pide: requeriría reescribir el acceso a datos y restablecer RLS con token de usuario.
- **Uso compartido o remoto del servidor con `service_role`**: el bypass de RLS se declara y acepta **solo** para una herramienta local monousuario. Un despliegue multiusuario o un gateway HTTP con esa clave no forma parte de esta feature.
- **Proxy HTTP obligatorio hacia `apps/api`** (decisión explícita): la arquitectura de esta feature es acceso directo a Supabase + reutilización por import; no se introduce capa de API intermedia.
- **Streaming de respuestas en tools MCP**: no lo soporta el protocolo actual; `chat_with_library` devuelve la respuesta completa.
- **Despliegue del MCP server como servicio** (Docker, Railway, Cloud Run) — solo STDIO local.
- **Tools de lectura/escritura de conversaciones e historial de chat.**
- **Rate limiting, cuotas o auditoría de uso** por tool o por agente.
- **Cambios de esquema de datos, migraciones o endpoints nuevos** en `apps/api`.
