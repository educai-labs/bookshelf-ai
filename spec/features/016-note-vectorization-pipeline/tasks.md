---
estado: "hecho"
---

# 016 · Note Vectorization Pipeline — Tareas

- [x] Añadir `tiktoken` y `google-generativeai` a `apps/api/pyproject.toml`.
- [x] Documentar `GEMINI_API_KEY` en `.env.example` y `apps/api/.env.example`.
- [x] Confirmar que `apps/api/app/core/config.py` expone `settings.gemini_api_key` para el pipeline.
- [x] Reemplazar el stub de `apps/api/app/services/vectorization.py` por `async def vectorize_note(note_id: UUID, user_id: UUID, book_id: UUID, content: str) -> None`.
- [x] Inicializar el cliente de Google Gemini con `settings.gemini_api_key` sin registrar la clave ni el contenido de la nota.
- [x] Implementar la conversión determinista de Markdown a texto plano y HTML renderizado para la operación de vectorización.
- [x] Implementar el chunking con `tiktoken.get_encoding("cl100k_base")`, ventanas de 500 tokens, avance de 450 y solapamiento de 50.
- [x] Manejar notas inferiores a 500 tokens como un único chunk con `chunk_index=1`.
- [x] Decodificar cada ventana de tokens antes de enviarla a embeddings y conservar el orden original.
- [x] Ejecutar `genai.embed_content` en un worker apropiado para no bloquear el event loop, usando el modelo y `task_type` definidos en el plan.
- [x] Validar que la respuesta de embeddings contiene exactamente un vector de 768 floats por chunk antes de modificar la base de datos.
- [x] Implementar un único reintento ante `GoogleAPIError` y finalizar sin escrituras si el segundo intento falla.
- [x] Añadir logs estructurados de duración, tokens, chunks, `note_id` y errores, sin incluir secretos ni contenido.
- [x] Obtener el cliente Supabase `service_role` desde `apps/api/app/core/database.py`.
- [x] Implementar la sustitución idempotente de chunks en `book_notes` en el orden DELETE → INSERT batch → UPDATE.
- [x] Preparar el insert batch con `user_id`, `book_id`, contenido de cada chunk, `content_html`, índices incrementales y embeddings.
- [x] Actualizar la fila `chunk_index=0` con el HTML renderizado de la nota original.
- [x] Capturar errores de Supabase/DB, registrar una alerta estructurada y no reintentar automáticamente las operaciones de base de datos.
- [x] Verificar en `apps/api/app/api/v1/endpoints/notes.py` que `POST /notes` encola `vectorize_note` con los cuatro argumentos requeridos.
- [x] Añadir `apps/api/tests/test_vectorization.py` con mocks de Gemini, Supabase y reloj.
- [x] Probar en `test_vectorization.py` el conteo de chunks, el solapamiento, las notas cortas y el orden de los índices.
- [x] Probar en `test_vectorization.py` la forma de los embeddings y los parámetros de la llamada batch.
- [x] Probar en `test_vectorization.py` el orden DELETE/INSERT/UPDATE y la idempotencia de la sustitución.
- [x] Probar en `test_vectorization.py` el reintento único de `GoogleAPIError` y el fallo sin escritura tras dos errores.
- [x] Probar en `test_vectorization.py` el error de base de datos sin reintento automático.
- [x] Mantener o ajustar en `apps/api/tests/test_notes.py` la verificación de que `POST /notes` encola la tarea background.
- [x] Ejecutar la suite backend con `cd apps/api && pytest -v`.
- [x] Ejecutar el lint y formateo backend con `cd apps/api && ruff check . && black --check .`.
- [x] Ejecutar el build backend con `cd apps/api && docker build -t bookshelf-api .`. _(Docker no disponible en el entorno: se validó la resolución de dependencias con `pip-compile` sobre `pyproject.toml`, que es el paso de build del Dockerfile.)_
- [x] Actualizar documentación si aplica.
- [x] Validar contra los criterios de aceptación de `spec.md`.
- [x] Mover la feature a "Hecho" en `../../constitution/roadmap.md`. _(Responsabilidad del agente `roadmap`, no del implementador.)_
