# 016 · Note Vectorization Pipeline

**Estado:** propuesta

## Qué hace

Implementa el pipeline asíncrono que vectoriza notas al crearse (disparado desde `POST /notes`, feature 010). Ubicado en `apps/api/app/services/vectorization.py`.

Proceso por nota:
1. Recibe `note_id`, `user_id`, `book_id`, `content` (Markdown original).
2. **Chunking**: divide `content` en chunks de ~500 tokens con 50 tokens de overlap. Usa `tiktoken` encoding `cl100k_base` (compatible con `text-embedding-004`). Cada chunk → texto plano (sin markdown, o markdown renderizado a texto).
3. **Embeddings**: batch `google.generativeai.embed_content` (modelo `text-embedding-004`, 768 dims) para todos los chunks de la nota (máx ~20 chunks/nota típica → 1 request batch).
4. **Upsert**: borra chunks previos de esa nota (`DELETE FROM book_notes WHERE book_id = ? AND chunk_index > 0`), luego inserta filas nuevas: `user_id`, `book_id`, `content` (chunk texto), `content_html` (vacío o markdown→html), `chunk_index` (1..N), `embedding` (vector).
5. Actualiza fila `chunk_index=0` (nota original) con `content_html` renderizado si no estaba.
6. Logging: duración, tokens, chunks creados, errores.

Ejecución: `BackgroundTasks` de FastAPI (no bloquea response). Para producción futura: migrar a Celery/RQ + Redis.

## Por qué

Vectorización es el corazón de RAG (feature 017). Hacerla en background mantiene `POST /notes` rápido (<200ms). Chunking 500/50 balancea granularidad (recuperación precisa) vs contexto (chunks muy cortos pierden sentido). `text-embedding-004` es modelo Google nativo, 768 dims, buen recall. Borrar chunks previos permite re-vectorización idempotente (futuro: edición de notas).

## Criterios de aceptación

- [ ] Función `async vectorize_note(note_id: UUID, user_id: UUID, book_id: UUID, content: str) -> None` en `services/vectorization.py`.
- [ ] Chunking: `tiktoken.get_encoding("cl100k_base")`; sliding window 500 tokens, overlap 50; maneja notas < 500 tokens (1 chunk, `chunk_index=1`).
- [ ] Embeddings: `genai.embed_content(model="models/text-embedding-004", content=chunks, task_type="RETRIEVAL_DOCUMENT")` → lista de 768 floats.
- [ ] Transacción Supabase: `DELETE` + `INSERT` batch (`.upsert()` o `.insert()` multiple) en `book_notes`; usa cliente `service_role` (bypass RLS).
- [ ] Manejo errores: `google.api_core.exceptions.GoogleAPIError` → log + reintento 1x; error DB → log + alerta (no reintento automático para no duplicar).
- [ ] Idempotencia: llamar 2x con misma nota → mismo resultado (DELETE previo).
- [ ] Tests: mock `genai` + `supabase`; verifica chunks correctos (conteo, overlap), embeddings shape, upsert llamado con params correctos.
- [ ] Integración: `POST /notes` (feature 010) llama `background_tasks.add_task(vectorize_note, ...)`.

## Fuera de alcance

- Cola de tareas persistente (Celery/RQ) — background tasks in-memory suficiente para MVP.
- Re-vectorización masiva tras cambio de modelo/parámetros — feature dedicada.
- Chunking semántico (por párrafos/secciones) — simple token-based para MVP.
- Métricas / observabilidad (Prometheus) — feature 020.
- Fallback a otro proveedor embeddings (OpenAI, Cohere) — fijo a Google (tech-stack).