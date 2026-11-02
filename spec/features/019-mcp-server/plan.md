# 019 · MCP Server — Plan

## Enfoque

Construir `apps/mcp` como un proceso FastMCP local sobre STDIO, con una capa de
configuración y errores propia y cinco tools Pydantic pequeñas. El proceso
creará un cliente Supabase con `service_role`, fijará el `MCP_USER_ID` al
arranque y aplicará ese filtro explícitamente en cada lectura e inserción.

La lógica de negocio existente se consumirá por import desde `apps/api/app`
(chat, lookup ISBN, renderizado de notas y vectorización); el MCP solo adaptará
la entrada/salida síncrona del protocolo y el contexto de usuario. El chat
consumirá el iterador existente hasta reunir una respuesta completa, mientras
que la vectorización se encolará como tarea asíncrona. Las pruebas aislarán
Supabase, Gemini, servicios externos y tareas de backend con mocks.

## Implementación

1. Crear `apps/mcp/pyproject.toml` con Python 3.11+, `fastmcp` como única
   dependencia nueva y las dependencias de backend necesarias ya existentes;
   configurar pytest, Ruff y Black con las convenciones del backend.
2. Crear `apps/mcp/config.py` para leer y validar al arranque
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY` y
   `MCP_USER_ID` (URL y UUID incluidos), aceptar opcionalmente
   `GOOGLE_BOOKS_API_KEY`, y producir errores de configuración que solo
   mencionen nombre y formato esperado, nunca valores secretos.
3. Crear `apps/mcp/errors.py` y `apps/mcp/schemas.py` con el error estructurado
   `{code, message}` y modelos Pydantic explícitos de entrada/salida para las
   cinco tools, incluidos campos opcionales y valores nulos de `status` y
   `rating`; centralizar la conversión de excepciones para no filtrar stack
   traces, credenciales ni detalles de conexión.
4. Crear `apps/mcp/db.py` para inicializar el cliente Supabase con
   `service_role` únicamente después de validar configuración y exponer helpers
   de ownership que siempre agreguen `user_id = MCP_USER_ID`. Mantener las
   consultas de libros y notas limitadas a las columnas de cada contrato,
   incluyendo búsqueda case-insensitive por título/autores y notas padre
   (`chunk_index = 0`) ordenadas por `created_at DESC`.
5. Crear `apps/mcp/tools/books.py` con `search_books` y `get_book_notes`:
   validar query y UUID, comprobar ownership antes de devolver notas, y mapear
   ausencia/ajeno a errores estructurados sin revelar si existe información de
   otro usuario.
6. Crear `apps/mcp/adapters/backend.py` (o módulos equivalentes mínimos) para
   hacer importable `apps/api/app` al ejecutar `cd apps/mcp && python server.py`
   sin levantar FastAPI ni hacer HTTP. Documentar en ese adaptador cualquier
   ajuste de path, cliente o firma requerido para reutilizar
   `app.services.chat`, `app.services.isbn_lookup`, `app.services.notes` y
   `app.services.vectorization`, sin copiar prompts, lookup, chunking o
   embeddings.
7. Crear `apps/mcp/tools/ai.py` con `chat_with_library`: validar ownership del
   `book_id` cuando se proporciona, reproducir el modo libro o RAG global
   mediante los helpers importados (incluidos los mismos umbrales/RPC),
   consumir todos los tokens de `stream_chat_tokens` y devolver un único texto;
   convertir fallos de Gemini, RPC, timeout y libro inexistente/ajeno en el
   contrato de error MCP.
8. Crear `apps/mcp/tools/write.py` con `create_book` y `create_note`. Reutilizar
   `ISBNLookupService` para normalización, fuentes y fallback; comprobar
   duplicados por `MCP_USER_ID` antes de insertar y mapear sus errores. Para
   notas, comprobar ownership del libro, conservar Markdown, renderizar HTML,
   insertar `chunk_index = 0` con el placeholder de 768 dimensiones y programar
   `vectorize_note(note_id, user_id, book_id, content)` sin reimplementar el
   pipeline.
9. Crear `apps/mcp/server.py` y `apps/mcp/tools/__init__.py`: validar entorno
   antes de registrar/exponer tools, configurar Gemini sin registrar claves,
   registrar exactamente las cinco funciones FastMCP y ejecutar STDIO con el
   entrypoint `python server.py`. Asegurar que la salida de protocolo no se
   mezcle con logs y que los logs sean seguros.
10. Crear `apps/mcp/README.md` con arranque local, tabla completa de variables,
    ejemplos para `claude_desktop_config.json` y `.cursor/mcp.json`, y la
    advertencia explícita de servidor local monousuario, bypass de RLS por
    `service_role` y prohibición de compartir o commitear secretos.
11. Añadir tests en `apps/mcp/test_*.py` para configuración sin secretos,
    esquemas y errores, camino feliz de las cinco tools, aislamiento entre dos
    usuarios, libro inexistente/ajeno, ISBN inválido/no encontrado/duplicado,
    fallo de Gemini/Supabase sin stack trace, consumo completo del chat y
    encolado de vectorización. Ejecutar `cd apps/mcp && pytest -v` y
    `cd apps/mcp && ruff check . && black --check .`.

## Decisiones

- **STDIO local con FastMCP** — es el transporte requerido por los clientes
  locales y evita despliegue, streaming propio o un servidor HTTP adicional;
  se descartan Docker, Cloud Run y proxy hacia `apps/api` por estar fuera del
  alcance.
- **Acceso directo con `service_role` y filtro explícito por `MCP_USER_ID`** —
  respeta la decisión arquitectónica de la spec y permite funcionar sin API
  levantada; se descarta confiar en RLS o en un JWT por sesión porque esta
  feature es deliberadamente monousuario.
- **Reutilización por import de servicios de `apps/api`** — conserva prompts,
  fuentes ISBN, RPC, chunking y modelo de embeddings; se descarta duplicar
  lógica en MCP. Cualquier incompatibilidad se resuelve en un adaptador mínimo
  documentado, no en una segunda implementación de dominio.
- **Respuesta completa para chat** — se consume el generador existente y se
  concatena el texto antes de responder, porque el contrato MCP de esta feature
  no expone streaming; no se implementa un protocolo paralelo de eventos.
- **Inserción de nota con placeholder y vectorización delegada** — mantiene la
  restricción `embedding NOT NULL` y el contrato de la feature 016; se descarta
  un pipeline MCP alternativo que podría divergir en chunking o dimensiones.
- **Errores y esquemas propios de MCP** — Pydantic valida tanto entradas como
  respuestas y un mapper común evita filtrar excepciones; se descartan mensajes
  crudos de Supabase/Gemini y stack traces al agente.

## Riesgos

- **Los módulos de `apps/api` no son importables desde el directorio MCP** —
  mitigar con un bootstrap/adaptador mínimo y tests que ejecuten exactamente
  `cd apps/mcp && python server.py`; documentar la integración sin arrancar
  FastAPI ni requerir `API_BASE_URL`.
- **El bypass de RLS puede causar fuga o escritura cross-user** — centralizar
  el usuario validado, exigir `.eq("user_id", MCP_USER_ID)` en cada query y
  revisar con tests de dos usuarios todas las tools, incluidas inserciones.
- **Un secreto aparece en logs o errores de una dependencia** — no incluir
  valores de entorno en excepciones, usar mensajes sanitizados y capturar
  excepciones en el borde de cada tool; cubrir arranque y fallos con aserciones
  de ausencia de claves.
- **Cambios de firma o inicialización de servicios del backend rompen MCP** —
  encapsular imports en un adaptador versionado por contrato y probar mocks de
  chat, lookup y vectorización; no modificar el comportamiento de `apps/api`.
- **La generación o vectorización bloquea el proceso STDIO** — reunir el chat
  mediante funciones async y ejecutar llamadas síncronas de servicios en tareas
  apropiadas; encolar vectorización sin retrasar la respuesta de `create_note`.
- **Duplicados o inserciones parciales al crear libros/notas** — comprobar
  ISBN y ownership antes de insertar, mapear restricciones únicas a `ALREADY_EXISTS`
  y verificar en tests que los fallos no dejan filas duplicadas ni notas de un
  libro ajeno.
- **La salida de logs contamina el protocolo STDIO** — separar el canal de
  logging del transporte MCP y probar el arranque/ejecución con un harness que
  valide únicamente mensajes de protocolo válidos.
