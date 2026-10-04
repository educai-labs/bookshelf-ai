---
estado: "hecho"
---

# 031 · Fix API Startup — get_supabase_client — Tareas

- [x] Añadir `get_supabase_client() -> Client | None` junto a `get_supabase()` en `apps/api/app/core/database.py`.
- [x] Implementar `get_supabase_client()` para devolver directamente `_supabase` sin inicialización implícita ni excepciones.
- [x] Confirmar que `get_supabase()`, `init_db()` y `close_db()` conservan su comportamiento actual, incluido el `HTTPException` 503 de `get_supabase()`.
- [x] Auditar `apps/api/app/services/vectorization.py` y confirmar que importa y llama a `get_supabase_client` desde `app.core.database`.
- [x] Confirmar en `vectorize_note` la comprobación de cliente `None`, el log `vectorize_note_db_unavailable` y la salida sin escrituras ni excepciones cuando no hay cliente.
- [x] Confirmar que el pipeline de chunking, embeddings y persistencia no se modifica.
- [x] Revisar `apps/api/tests/test_vectorization.py` y alinear los mocks, docstrings y referencias con `app.services.vectorization.get_supabase_client`.
- [x] Cubrir en `apps/api/tests/test_vectorization.py` el camino con cliente falso y el camino con cliente no inicializado, conservando las pruebas funcionales existentes.
- [x] Barrer las apariciones de `get_supabase_client` bajo `apps/` y confirmar que todas resuelven al helper definido en `apps/api/app/core/database.py`.
- [x] Confirmar que no quedan referencias huérfanas y que se excluye del cambio la documentación histórica fuera de alcance.
- [x] Ejecutar `cd apps/api && python -c "import app.main"` y confirmar que termina con exit 0 sin `ImportError`.
- [x] Arrancar el servidor con `cd apps/api && uvicorn app.main:app --host 0.0.0.0 --port 8000` y confirmar que queda sirviendo sin `ImportError`; detenerlo después de la comprobación.
- [x] Ejecutar `cd apps/api && pytest -v` y corregir cualquier regresión introducida por este fix.
- [x] Ejecutar `cd apps/api && ruff check . && black --check .` y corregir cualquier incumplimiento de lint o formato introducido por este fix.
- [x] Actualizar documentación si aplica.
- [x] Validar contra los criterios de aceptación de `spec.md`.
- [x] Modificar `apps/api/app/core/database.py` para pasar `str(settings.supabase_url)` a `create_client()` dentro de `init_db()`, conservando el tipo `HttpUrl` de la configuración y el resto del ciclo de inicialización.
- [x] Arrancar con `.env` presente mediante `cd apps/api && uvicorn app.main:app --host 0.0.0.0 --port 8000` y comprobar `GET /health` → 200, confirmando que no aparece `TypeError: expected string or bytes-like object, got 'HttpUrl'`; detener el proceso tras la comprobación.
- [x] Ejecutar `cd apps/api && pytest -v` y confirmar que la suite pasa tras la corrección de `init_db()`.
- [x] Ejecutar `cd apps/api && ruff check . && black --check .` y confirmar que lint y formato pasan tras la corrección.
- [x] Mover la feature a "Hecho" en `../../constitution/roadmap.md`.
