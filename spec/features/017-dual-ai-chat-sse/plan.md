# 017 · Dual AI Chat SSE — Plan

## Enfoque

Implementar un servicio de chat en FastAPI que prepare el contexto según el modo
solicitado y exponga un `StreamingResponse` SSE autenticado. El frontend será una
página Client Component en el App Router: enviará cada consulta con `fetch` y
consumirá el `ReadableStream`, ya que `EventSource` nativo no permite `POST` ni
enviar el cuerpo `ChatRequest`. La conversación permanecerá únicamente en
`sessionStorage`, sin introducir persistencia ni una cola adicional.

## Implementación

1. **Contrato y configuración backend** — Añadir `ChatRequest` y los tipos de modo
   (`Literal["book", "rag"]`) en `apps/api/app/models/chat.py`; reutilizar
   `settings.gemini_api_key` y documentar `GEMINI_API_KEY` en `.env.example` y
   `apps/api/.env.example`, sin añadir una clave al código. Verificar que las
   dependencias existentes `google-generativeai` y `supabase` cubren la integración.
2. **Servicio de chat** — Crear `apps/api/app/services/chat.py` con helpers separados
   para: validar y cargar el libro/notas propias; construir el prompt de contexto
   libro con título, autores y notas completas ordenadas por `chunk_index >= 0`;
   obtener el embedding de consulta con `text-embedding-004` y
   `RETRIEVAL_QUERY`; invocar `supabase.rpc("match_book_notes", ...)` con el
   `user_id`, threshold `0.7` y count `10`; y construir el prompt RAG incluyendo
   contenido y título de cada resultado. Aislar las llamadas síncronas de Gemini
   del event loop mediante un worker apropiado y exponer un iterador async de
   tokens que use `gemini-2.0-flash` y `generate_content_stream`.
3. **Endpoint SSE** — Crear `apps/api/app/api/v1/endpoints/ai.py` con
   `POST /api/v1/ai/chat`, `Depends(get_current_user)` y `Depends(get_supabase)`.
   Aplicar por usuario la comprobación de ownership del libro antes de leer sus
   datos; exigir `book_id` en modo `book` y resolver el modo por defecto a `book`
   cuando hay libro, o `rag` cuando no lo hay. Devolver
   `StreamingResponse(media_type="text/event-stream")` y serializar cada token
   como `data: {"chunk": ..., "done": false}\n\n`, seguido del evento final con
   `done: true`. Convertir fallos de validación, Gemini, Supabase y ausencia de
   credenciales en un evento `error` con `done: true`, sin filtrar secretos.
4. **Timeout y limpieza** — En el generador del endpoint envolver la operación
   completa con un límite total de 60 segundos usando `asyncio.wait_for`; ante
   timeout, cancelación del cliente o excepción, cancelar el worker/iterador,
   cerrar recursos y emitir el evento de error cuando la conexión aún esté viva.
   Mantener los errores HTTP estructurados para fallos ocurridos antes de iniciar
   el stream.
5. **Registro del router** — Importar el nuevo módulo y registrar `ai.router` en
   `apps/api/app/api/v1/router.py`, conservando el prefijo global `/api/v1` para
   producir exactamente `/api/v1/ai/chat`.
6. **Cliente API y render Markdown** — Añadir `marked` a `apps/web/package.json`
   (justificación: no hay parser Markdown instalado y la spec exige renderizado)
   y crear `apps/web/src/lib/api/chat.ts` con el
   contrato camelCase, obtención del JWT de la sesión Supabase y un parser SSE
   incremental que soporte datos partidos entre lecturas, eventos `done` y
   `error`, y centralizar el resultado en `apps/web/src/utils/markdown.ts` o un
   helper de chat; sanitizar siempre el HTML
   con `apps/web/src/utils/sanitize.ts`/`DOMPurify` antes de usar
   `dangerouslySetInnerHTML`.
7. **Página y componentes frontend** — Crear
   `apps/web/src/app/(dashboard)/chat/page.tsx` y componentes bajo
   `apps/web/src/components/chat/` (`ChatPage`/`ChatMessage`/`ChatInput`). Leer el
   `book_id` opcional de `searchParams`, permitir seleccionar contexto libro o
   RAG, enviar `POST /ai/chat`, pintar la respuesta token a token, mostrar estado
   de error/fin y evitar enviar consultas vacías. Usar componentes shadcn y el
   layout responsive existente.
8. **Historial de sesión e integración** — Hidratar al montar desde
   `sessionStorage["chat_history"]`, mantener mensajes `{ role, content }`,
   actualizar el almacenamiento tras cada cambio y manejar JSON inválido o
   historial antiguo descartándolo de forma segura. Mantener `ChatButton.tsx` de
   `apps/web/src/components/book-detail/` apuntando a `/chat?book_id=...` y
   verificar que la página admite dicho contexto.
9. **Tests backend** — Añadir tests colocalizados o en `apps/api/tests/` (por
   ejemplo `test_chat.py`) con mocks de Gemini, embedding, Supabase y autenticación:
   cubrir prompts y orden de notas, ownership, defaults y separación book/RAG,
   argumentos del RPC, chunks SSE, evento final, errores y timeout de 60 segundos.
10. **Tests frontend** — Añadir tests RTL/Vitest bajo
    `apps/web/src/components/chat/` o `__tests__/`: mockear `fetch` y su
    `ReadableStream`, verificar render progresivo, selección de modo, Markdown
    sanitizado, `sessionStorage`, `book_id` y manejo de eventos de error.
11. **Validación final** — Ejecutar `cd apps/api && pytest -v` y
    `ruff check . && black --check .`; ejecutar `cd apps/web && npm run test`,
    `npm run lint` y `npm run build`. No modificar migraciones: el RPC
    `match_book_notes` ya forma parte del esquema de la constitución.

## Decisiones

- **`fetch` + `ReadableStream` en lugar de `EventSource`** — Permite conservar el
  contrato `POST` con JSON y el JWT en headers; `EventSource` solo soporta GET y no
  permite cuerpo. No se usan WebSockets porque SSE nativo es la convención del
  proyecto y basta para respuestas unidireccionales.
- **Servicio separado del endpoint** — Mantiene el router fino y permite probar de
  forma aislada prompts, ownership, embedding y streaming; se descarta concentrar
  toda la lógica en `ai.py` por acoplamiento y dificultad de mockear proveedores.
- **Cliente Supabase autenticado por usuario para lecturas/RPC** — El `user_id`
  proviene exclusivamente de `get_current_user` y se filtra en libro y RPC; no se
  usa `service_role` para una consulta de usuario. Se descarta confiar en un
  `user_id` recibido del frontend.
- **Gemini síncrono aislado del event loop** — Es compatible con la librería fijada
  por el stack sin bloquear otras peticiones; se descarta añadir otro SDK o un
  proveedor/modelo local, ambos fuera de la spec.
- **`marked` + DOMPurify para Markdown** — `marked` resuelve el requisito de
  renderizado sin construir un parser incompleto y DOMPurify evita XSS; se descarta
  insertar Markdown como texto plano o HTML no sanitizado. La dependencia solo se
  añade si el repositorio no ofrece ya un parser equivalente.
- **Historial exclusivamente en `sessionStorage`** — Cumple el alcance actual y
  evita cambios de esquema/API; se descarta persistir conversaciones hasta la
  feature futura indicada.

## Riesgos

- **La API síncrona de Gemini bloquea o no es iterable como se espera** — Encapsular
  la llamada en worker, adaptar el iterador a una interfaz async única y cubrirlo
  con mocks de chunks.
- **Fuga de datos de otro usuario en modo libro o RAG** — Derivar siempre el
  `user_id` del JWT, consultar libro/notas con filtro de ownership y pasar ese mismo
  valor al RPC; tests cross-user obligatorios.
- **SSE truncado o JSON dividido entre paquetes** — Parser backend/frontend basado
  en buffer hasta `\n\n`, tolerante a lecturas parciales, con evento final único y
  tests de fragmentación.
- **Timeout deja tareas o conexiones abiertas** — Cancelar explícitamente el
  iterador/worker en `finally`, cerrar el cliente cuando corresponda y probar la
  cancelación a los 60 segundos.
- **Prompt demasiado grande en modo book** — La spec exige notas completas; medir
  y registrar solo metadatos, nunca contenido sensible. Si Gemini rechaza el tamaño,
  devolver un evento de error claro sin truncar silenciosamente el contexto.
- **HTML generado para respuestas contiene XSS** — Sanitizar en cliente con
  DOMPurify antes de `dangerouslySetInnerHTML`, limitar la configuración a tags y
  atributos Markdown y probar scripts maliciosos.
- **Dependencia o configuración Gemini ausente** — Validar antes de iniciar el
  stream, documentar `GEMINI_API_KEY` y emitir error SSE estructurado sin revelar la
  clave; los tests deben cubrir la ruta sin credenciales.
- **Sesión inválida o historial corrupto** — Rechazar respuestas no autorizadas,
  mostrar error recuperable en UI y validar/descartar el contenido de
  `sessionStorage` antes de hidratarlo.
