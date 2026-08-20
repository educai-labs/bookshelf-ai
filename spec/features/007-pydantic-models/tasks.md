# 007 · Pydantic Models — Tareas

_Checklist accionable derivada del `plan.md`. Tareas pequeñas y concretas; marca `[x]` al completarlas._

- [x] Crear directorio `app/schemas/` y `__init__.py`
- [x] Crear `enums.py` con `BookStatus`
- [x] Crear `book_metadata.py` con `BookMetadata` + validador ISBN
- [x] Crear `book_create.py` con `BookCreate`
- [x] Crear `book_read.py` con `BookRead`
- [x] Crear `book_update.py` con `BookUpdate`
- [x] Crear `note_create.py` con `NoteCreate`
- [x] Crear `note_read.py` con `NoteRead`
- [x] Crear `chat_request.py` con `ChatRequest`
- [x] Crear `chat_response.py` con `ChatResponse`
- [x] Crear `recommendation_response.py` con `RecommendationResponse`
- [x] Verificar imports en `__init__.py` (orden correcto, sin ciclos)
- [x] Tests: `test_book.py` (happy path + ISBN/rating/page inválidos)
- [x] Tests: `test_note.py` (happy path + content vacío/page negativo)
- [x] Tests: `test_chat.py` (happy path + message límites/mode inválido)
- [x] Tests: `test_recommendation.py` (happy path + confidence fuera de rango)
- [x] Ejecutar tests (`pytest app/schemas/ -v`) → 100% pass
- [x] Levantar backend y verificar `GET /openapi.json` incluye 10+ schemas sin errores
- [x] Actualizar documentación si aplica (N/A: los docstrings de cada modelo son la documentación; `docs/` solo contiene supabase-setup de la feature 001)
- [x] Validar contra los criterios de aceptación de `spec.md`.
- [ ] Mover la feature a "Hecho" en `../../constitution/roadmap.md` (lo ejecuta el agente `roadmap` tras aprobación del revisor)

## Mantenimiento (checklist recurrente)

_Opcional. Pasos a repetir cada vez que se toque esta feature en el futuro (revisar datos, regenerar algo, etc.). Borra esta sección si no aplica._

- [ ] <Acción recurrente.>