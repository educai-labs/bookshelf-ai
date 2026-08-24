# 016 · Note Vectorization Pipeline — Plan

## Enfoque

Implementar el pipeline en `apps/api/app/services/vectorization.py` como una tarea
asíncrona de FastAPI que mantiene la creación de notas rápida y concentra toda la
operación de sistema en el cliente Supabase `service_role`. El contenido se
normaliza a texto, se divide con una ventana determinista de `tiktoken`, se
vectoriza en un único batch de Google Gemini cuando sea posible y se reemplazan
los chunks existentes de forma idempotente. La integración con `POST /notes` se
conserva mediante `BackgroundTasks`, sin introducir una cola persistente en el
MVP.

## Implementación

1. Añadir `tiktoken` y `google-generativeai` a `apps/api/pyproject.toml`, y documentar
   que `GEMINI_API_KEY` es necesaria para el pipeline en `.env.example` y
   `apps/api/.env.example`, reutilizando `settings.gemini_api_key` de
   `apps/api/app/core/config.py`.
2. Reemplazar el stub de `apps/api/app/services/vectorization.py` por
   `async def vectorize_note(note_id: UUID, user_id: UUID, book_id: UUID, content: str) -> None`.
   Inicializar el cliente Google con la clave de configuración, medir duración y
   emitir logs estructurados con `note_id`, tokens, chunks, duración y errores,
   sin incluir contenido ni secretos.
3. Implementar en el servicio la conversión determinista de Markdown a texto
   plano y el chunking con `tiktoken.get_encoding("cl100k_base")`: ventana de 500
   tokens, avance de 450, solapamiento de 50, y un único chunk con índice 1 para
   notas inferiores a 500 tokens. Decodificar cada ventana antes de enviarla a
   embeddings y conservar el orden original.
4. Ejecutar `genai.embed_content` con
   `model="models/text-embedding-004"`, `content=chunks` y
   `task_type="RETRIEVAL_DOCUMENT"`. Como la librería es síncrona, aislar la
   llamada bloqueante del event loop mediante un worker apropiado; validar que
   devuelve exactamente un vector de 768 floats por chunk. Ante
   `GoogleAPIError`, registrar el fallo y reintentar una sola vez; si vuelve a
   fallar, terminar la tarea sin tocar la base de datos.
5. Obtener el cliente `service_role` desde `apps/api/app/core/database.py` y
   realizar la sustitución en `book_notes`: borrar los registros de la nota con
   `book_id` y `chunk_index > 0`, preparar un insert batch con `user_id`,
   `book_id`, texto, `content_html`, índice incremental 1..N y embedding, y
   actualizar la fila `chunk_index=0` con el HTML renderizado. Mantener el orden
   DELETE → INSERT → UPDATE, capturar errores de Supabase/DB, registrar una alerta
   estructurada y no reintentar automáticamente operaciones de base de datos.
6. Verificar en `apps/api/app/api/v1/endpoints/notes.py` que `POST /notes` sigue
   llamando `background_tasks.add_task(vectorize_note, ...)` con los cuatro
   identificadores/contenido requeridos; ajustar únicamente tipos o imports si
   fueran necesarios para el contrato UUID.
7. Añadir `apps/api/tests/test_vectorization.py` con mocks de `genai`, cliente
   Supabase y reloj: comprobar conteo y solapamiento de chunks, nota corta,
   shape de embeddings, parámetros del batch, DELETE/INSERT/UPDATE, reintento
   único, error de DB sin reintento e idempotencia. Mantener en
   `apps/api/tests/test_notes.py` la verificación de que el background task se
   encola desde `POST /notes`.

## Decisiones

- **`tiktoken` con `cl100k_base` y ventana 500/50** — Cumple la convención fija de la constitución y hace reproducible el chunking; se descarta el chunking semántico porque está fuera de alcance.
- **Texto plano antes de embeddings** — Evita que la sintaxis Markdown domine la representación semántica, manteniendo HTML solo para la fila padre/preview; se descarta enviar Markdown sin normalizar.
- **Batch único por nota y llamada síncrona aislada del event loop** — Reduce latencia y consumo de API para las notas típicas sin bloquear FastAPI; se descarta una llamada por chunk por coste y peor rendimiento.
- **`BackgroundTasks` + cliente `service_role`** — Es la solución suficiente para el MVP y permite operar con RLS bypass solo en backend; se descarta Celery/RQ + Redis porque la cola persistente está fuera de alcance.
- **Reemplazo por DELETE seguido de insert batch** — Hace la operación idempotente y evita duplicados al reejecutar una nota; se descarta conservar chunks antiguos porque mezclar versiones corrompería la recuperación.
- **Un único reintento solo para `GoogleAPIError`** — Absorbe fallos transitorios de Gemini sin repetir escrituras; se descarta reintentar errores de DB para evitar estados duplicados o inconsistentes.

## Riesgos

- **Dependencias o clave Gemini ausentes** — El arranque sigue siendo posible sin credenciales, pero la tarea registra un error estructurado y no escribe datos; documentar la variable y cubrir la ruta en tests.
- **La llamada de embeddings bloquea el event loop** — Ejecutarla fuera del contexto async mediante un worker y probar que `POST /notes` retorna sin esperar al proveedor.
- **Respuesta de Gemini con cantidad o dimensión incorrecta** — Validar número de vectores y 768 componentes antes del DELETE; registrar el error y conservar los chunks anteriores.
- **Fallo entre DELETE e INSERT** — No reintentar automáticamente, emitir alerta con identificadores y mantener la operación ordenada; la futura migración a cola persistente/transacción dedicada queda fuera del MVP.
- **Re-vectorización concurrente de la misma nota** — El contrato idempotente evita duplicados en ejecuciones secuenciales; documentar que la coordinación distribuida pertenece a la futura cola persistente y detectar errores DB en logs.
- **Coste, cuota o latencia de la API Google** — Limitar a una petición batch por nota, registrar duración/tokens y aplicar solo el reintento permitido por la spec.
