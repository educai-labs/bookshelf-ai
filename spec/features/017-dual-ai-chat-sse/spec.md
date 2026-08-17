# 017 · Dual AI Chat SSE

**Estado:** propuesta

## Qué hace

Implementa el endpoint de chat IA con streaming SSE en `apps/api/app/api/v1/endpoints/ai.py` y el frontend para consumirlo.

**Backend — POST `/api/v1/ai/chat`**:
- Request: `ChatRequest { query: str, book_id?: UUID, mode?: "book" | "rag" }` (default: "book" si `book_id`, else "rag").
- Response: `text/event-stream` — chunks `data: { "chunk": "...", "done": false }\n\n`, final `data: { "chunk": "", "done": true }\n\n`.
- **Modo "book" (Contexto Libro)**: `book_id` requerido. Fetch `book` + todas sus `book_notes` (chunks `chunk_index >= 0`, orden `chunk_index`). Construye system prompt: "Eres un asistente de lectura. El usuario pregunta sobre el libro 'TITLE' de AUTHOR. Notas del usuario: [NOTAS COMPLETAS]. Responde basándote en ellas." → `gemini-2.0-flash` streaming (`generate_content_stream`).
- **Modo "rag" (RAG Global)**: sin `book_id`. Embedding de `query` (`text-embedding-004`, `RETRIEVAL_QUERY`). Llama RPC `match_book_notes(embedding, user_id, 0.7, 10)`. Construye prompt: "Responde usando estos fragmentos de tu biblioteca: [CHUNKS CON TÍTULO LIBRO]. Si no hay info relevante, dilo." → `gemini-2.0-flash` streaming.
- Auth: `Depends(get_current_user)` → `user_id` inyectado en ambos modos.
- Errores: stream `data: { "error": "...", "done": true }`.

**Frontend — Chat Component**:
- Página `/chat` (o modal en book detail) con `book_id` opcional via query param.
- `EventSource` (nativo) o `fetch` + `ReadableStream` parsing SSE.
- Renderiza chunks progresivos en burbuja asistente (markdown renderizado).
- Input usuario → `POST /ai/chat` → muestra streaming.
- Historial local (sessionStorage) para persistir conversación al recargar.

## Por qué

Chat dual cubre dos casos de uso core: "Habla con este libro" (contexto profundo, notas completas) y "Pregunta a tu biblioteca" (RAG semántico, descubrimiento). SSE nativo evita WebSockets complejos, funciona en edge/serverless, compatible con `EventSource`. `gemini-2.0-flash` es rápido y barato para streaming.

## Criterios de aceptación

- [ ] Endpoint `POST /api/v1/ai/chat` en `ai.py`, registered en router.
- [ ] Modo "book": valida `book_id` ownership; fetch `book` + `notes` (`.select("content,chunk_index").order("chunk_index")`); prompt template con placeholders; streaming `genai.GenerativeModel("gemini-2.0-flash").generate_content_stream(prompt)`.
- [ ] Modo "rag": embedding query → RPC `match_book_notes` (raw SQL via `supabase.rpc()`); prompt con chunks + títulos; streaming igual.
- [ ] SSE formatting correcto: `yield f"data: {json.dumps({'chunk': token, 'done': False})}\n\n"`; final `done: True`.
- [ ] Timeout: 60s total stream; `asyncio.wait_for` + cleanup.
- [ ] Frontend: `ChatPage` en `src/app/(dashboard)/chat/page.tsx` (o `/book/[id]/chat`); `EventSource` con `onmessage` parse JSON; `dangerouslySetInnerHTML` con `DOMPurify` para markdown renderizado.
- [ ] Historial: `sessionStorage['chat_history']` array `{ role, content }`; hidratación al montar.
- [ ] Tests backend: mock `genai` + `supabase.rpc`; verifica prompt construction, streaming chunks, modo book vs rag, auth.
- [ ] Tests frontend: RTL mock `EventSource`; verifica render progresivo, historial, error handling.

## Fuera de alcance

- Persistencia de conversaciones en DB (feature futura).
- Compartir chats / exportar.
- Modo "comparar libros" / "síntesis multi-libro".
- Citaciones exactas (chunk → posición en nota original).
- Rate limiting por usuario (feature 020).
- Modelo local / Ollama — fijo a Gemini (tech-stack).