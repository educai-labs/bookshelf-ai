# Bookshelf MCP Server

Servidor **MCP (Model Context Protocol)** local y **monousuario** para la
biblioteca personal de Bookshelf. Expone la biblioteca del usuario a agentes IA
externos (Claude Desktop, Cursor, …) a través de 5 tools, reutilizando **por
import** la lógica ya construida en el backend (`apps/api`) sin levantar
FastAPI ni exponer la API.

## Arranque local

```bash
cd apps/mcp
python server.py
```

El servidor valida la configuración **antes** de exponer ninguna tool; si falta
o es inválida, termina con un mensaje en `stderr` que nombra la variable (sin
volcar secretos). La salida del protocolo MCP viaja por `stdout`; los logs van
a `stderr`.

## Variables de entorno

| Variable | Obligatoria | Propósito |
|----------|:-----------:|-----------|
| `SUPABASE_URL` | ✅ | URL del proyecto Supabase (formato http(s)). |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Clave `service_role` (bypass RLS). Solo backend/MCP. |
| `GEMINI_API_KEY` | ✅ | Clave de Google Gemini (chat y embeddings). |
| `MCP_USER_ID` | ✅ | UUID del usuario cuya biblioteca expone el servidor. |
| `GOOGLE_BOOKS_API_KEY` | — | Fallback opcional del lookup ISBN (Google Books). |

Puedes guardarlas en `apps/mcp/.env` (gitignored) o exportarlas en tu shell.

## Ejemplos de configuración

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "bookshelf": {
      "command": "python",
      "args": ["server.py"],
      "cwd": "/ruta/a/bookshelf/apps/mcp",
      "env": {
        "SUPABASE_URL": "https://<project-ref>.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "<service_role_key>",
        "GEMINI_API_KEY": "<gemini_api_key>",
        "MCP_USER_ID": "<uuid-del-usuario>"
      }
    }
  }
}
```

### Cursor (`.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "bookshelf": {
      "command": "python",
      "args": ["server.py"],
      "cwd": "/ruta/a/bookshelf/apps/mcp",
      "env": {
        "SUPABASE_URL": "https://<project-ref>.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "<service_role_key>",
        "GEMINI_API_KEY": "<gemini_api_key>",
        "MCP_USER_ID": "<uuid-del-usuario>"
      }
    }
  }
}
```

## Tools

| Tool | Descripción |
|------|-------------|
| `search_books(query)` | Libros del usuario cuyo título o autores coinciden con `query` (case-insensitive). |
| `get_book_notes(book_id)` | Notas completas del libro (`chunk_index = 0`). |
| `chat_with_library(query, book_id?)` | Respuesta completa: modo libro (con `book_id`) o RAG global (sin él). |
| `create_book(isbn)` | Crea el libro desde su ISBN (10/13) y devuelve su resumen. |
| `create_note(book_id, content)` | Crea la nota en Markdown y deja la vectorización en cola. |

## ⚠️ Advertencia de seguridad

- El servidor usa la **`service_role` key**, que **bypassea RLS**. El
  aislamiento entre usuarios **no** lo garantiza la base de datos, sino el
  código de cada tool (filtra siempre por `MCP_USER_ID`).
- Es un servidor **local y monousuario**: solo toca la instancia del propio
  usuario configurado en `MCP_USER_ID`.
- **Nunca compartas la `service_role` key ni la `GEMINI_API_KEY`**, **no las
  commitees** al repositorio ni las incluyas en logs o mensajes de error. No
  expongas este servidor de forma remota o multiusuario.
