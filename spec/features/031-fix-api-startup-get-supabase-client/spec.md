# 031 · Fix API Startup — get_supabase_client

**Estado:** hecho

## Qué hace

Restaura el arranque del backend FastAPI: `uvicorn app.main:app` vuelve a cargar sin `ImportError` **y** arranca sirviendo en ambos caminos — sin credenciales en `.env` (el cliente Supabase se omite con aviso) y con credenciales válidas presentes (`/health` responde 200, sin `TypeError`). `app/core/database.py` expone un helper nullable `get_supabase_client() -> Client | None` que devuelve el singleton sin lanzar (a diferencia de `get_supabase()`, que es una dependency de endpoint y responde 503), y el módulo de vectorización (feature 016) y sus tests consumen ese nombre real. En `init_db()`, `create_client()` pasa a recibir `supabase_url` como `str` (único cambio en el lifespan): el backend arranca con las credenciales reales del `.env`.

## Por qué

**Bug 1 (ImportError):** Un refactor previo renombró la función de acceso al cliente Supabase en `app/core/database.py`, pero `vectorization.py` (feature 016, estado hecho) siguió importando `get_supabase_client` (L34) → regresión fatal: al arrancar, la importación del módulo muere con `ImportError: cannot import name 'get_supabase_client' from 'app.core.database'` y ningún endpoint del API arranca. Es un bloqueante total del backend (dev y despliegue) y deja `pytest` desalineado (los mocks referencian el símbolo fantasma). Urgencia máxima: sin este fix, el API no existe.

La solución elegida (helper nullable) conserva el contrato documentado de la feature 016: `vectorize_note` es una tarea background (el cliente ya recibió su 201) y "no lanza excepciones" — si el cliente no está inicializado, se registra el error estructurado y la tarea termina sin escribir. Una `HTTPException` 503 no tiene sentido ahí: nadie puede responderla.

**Bug 2 (TypeError con credenciales):** Tras corregir el ImportError se detectó un segundo bloqueante preexistente: `app/core/config.py` define `supabase_url: HttpUrl | None = None` (tipo Pydantic, no `str`) e `init_db()` (`database.py` L39) lo pasa tal cual a `create_client()`. Con el paquete `supabase` 2.31.0 esto lanza `TypeError: expected string or bytes-like object, got 'HttpUrl'` dentro de `init_db()`, y `uvicorn app.main:app` falla al arrancar siempre que las credenciales del `.env` estén presentes — que es el caso real de ejecución. Sin credenciales arranca (rama de aviso), pero eso no desbloquea el uso normal del API. Ambas correcciones son el mismo bloqueante: que el backend arranque.

## Criterios de aceptación

- [ ] `cd apps/api && python -c "import app.main"` termina con exit 0 (import de la app completa, sin `ImportError`).
- [ ] `cd apps/api && uvicorn app.main:app --host 0.0.0.0 --port 8000` arranca y queda sirviendo sin `ImportError` en el camino **sin** credenciales en `.env` (el arranque registra el aviso de cliente Supabase omitido; síntoma original desaparecido).
- [ ] `cd apps/api && uvicorn app.main:app --host 0.0.0.0 --port 8000` arranca **con** las credenciales del `.env` presentes y `GET /health` responde HTTP 200, sin `TypeError` en `init_db()`: `create_client()` recibe `supabase_url` como `str` (p. ej. `str(settings.supabase_url)`).
- [ ] `app/core/database.py` expone `get_supabase_client() -> Client | None`: devuelve el singleton sin lanzar (`None` si no inicializado), sin alterar el contrato de `get_supabase()` ni el comportamiento de `close_db()`; el único cambio admitido en `init_db()` es la conversión de tipo de `supabase_url` a `str`.
- [ ] `app/services/vectorization.py` resuelve su import (L34) y llamada (L126) contra el helper real; con cliente no inicializado registra `vectorize_note_db_unavailable`, termina sin escribir y sin lanzar (degradación elegante de 016 intacta).
- [ ] `apps/api/tests/test_vectorization.py` mockea el nombre real consumido por el módulo (sin referencias a un símbolo inexistente).
- [ ] Barrido limpio: toda aparición de `get_supabase_client` bajo `apps/` resuelve al símbolo definido en `app/core/database.py` (sin referencias huérfanas).
- [ ] `cd apps/api && pytest -v` pasa al 100% (incluidos los tests de vectorización).
- [ ] `cd apps/api && ruff check . && black --check .` terminan exit 0, sin warnings.

## Fuera de alcance

- Migración del paquete deprecado `google.generativeai` → `google.genai` (solo emite `FutureWarning`, no bloquea el arranque; feature separada si se aborda).
- Corregir la mención obsoleta de `get_supabase_client` en `spec/features/009-books-crud-api/plan.md` (L22): historial de feature en "Hecho ✅" (inmutable por trazabilidad); la fuente de verdad del código es `app/core/database.py`.
- Cambiar algo del lifespan más allá de la conversión de tipo de `supabase_url` en `init_db()`: no se modifica el resto de `init_db()`, ni `close_db()`, ni el contrato público de `get_supabase()` (503 cuando no hay cliente).
- Cambiar el tipo declarado `supabase_url: HttpUrl | None` en `app/core/config.py` (la corrección es en el consumo dentro de `init_db()`, no en el modelo de settings).
- Refactors adicionales del pipeline de vectorización (chunking, reintentos, logs): solo lo estrictamente necesario para restaurar el arranque.
