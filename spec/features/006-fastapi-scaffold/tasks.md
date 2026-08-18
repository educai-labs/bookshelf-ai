# 006 · FastAPI Scaffold — Tasks Checklist

Granular checklist para el implementador. Cada tarea es pequeña, accionable y se marca con `[ ]` / `[x]`.

---

## 📁 Estructura

- [x] Crear árbol de directorios `apps/api/app/{core,api/v1/endpoints,services,models,db}` + `__init__.py` en cada paquete
- [x] Verificar que la estructura se replica exactamente: `app/{core,api/v1,services,models,db}` para aislar responsabilidades

## ⚙️ Configuración

- [x] Escribir `pyproject.toml` con dependencias PEP 621: `fastapi`, `uvicorn[standard]`, `pydantic`, `pydantic-settings`, `supabase`, `httpx`, `structlog`, `python-dotenv`, `pytest`, `pytest-asyncio`, `ruff`, `black`
- [x] Crear `.env.example` con variables: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `GEMINI_API_KEY`, `LOG_LEVEL`
- [x] Implementar `core/config.py`: clase `Settings` (Pydantic-Settings v2) con `model_config = SettingsConfigDict(env_file=".env", extra="ignore")` y campos tipados para las 5 vars requeridas

## 🧩 Core modules

- [x] Implementar `core/config.py`: clase `Settings` con validación de tipos y carga desde `.env`
- [x] Implementar `core/logging.py`: `configure_logging(settings.log_level)` → `structlog.configure()` con `JSONRenderer` (prod) / `ConsoleRenderer` (dev); exportar `get_logger`
- [x] Implementar `core/database.py`: singleton `SupabaseClient` (`supabase.create_client`) + `AsyncClient` (`httpx.AsyncClient`); funciones `get_supabase()` y `get_http_client()` para `Depends`; lifecycle start/close
- [x] Implementar `core/security.py`: `verify_jwt(token)` usando `SUPABASE_JWT_SECRET` (HS256); dependency `get_current_user` → extrae `user_id` del payload verificado

## 🚀 API

- [x] Implementar `api/v1/router.py`: `APIRouter(prefix="/api/v1")`; incluye `health.router` (y futuros routers)
- [x] Implementar `api/v1/endpoints/health.py`: `GET /health` → `{"status": "ok"}`

## 🚀 Main

- [x] Implementar `main.py`: `FastAPI(lifespan=lifespan)`, CORS middleware restrictivo a `http://localhost:3000` con `allow_credentials=True`, `include_router(v1_router)`, exception handlers globales, configuración de logging al inicio
- [x] Implementar `lifespan` en `main.py`: `asynccontextmanager` que llama `await init_db()` / `await close_db()` (de `core.database`) y `configure_logging()` al arranque

## 🐋 Docker

- [x] Crear `Dockerfile` multi-stage: **builder** (instala deps con `pip install --no-cache-dir -r requirements.txt` generado desde `pyproject.toml`), **runtime** (`python:3.11-slim`, copia artefactos, usuario no-root, `HEALTHCHECK CMD curl -f http://localhost:8000/health || exit 1`, `CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]`)

## 🧪 Tests

- [x] Crear `tests/test_health.py`: test `GET /health` con `httpx.AsyncClient` (app=FastAPI) → assert 200 + JSON `{status: "ok"}`
- [x] Crear `tests/test_auth.py`: mock `get_current_user` dependency override → test endpoint protegido (placeholder)
- [x] Configurar `pytest` en `pyproject.toml` `[tool.pytest.ini_options]`: `asyncio_mode = "auto"`, `testpaths = ["tests"]`

## ✅ Validación local

- [x] Verificar localmente: `cd apps/api && uvicorn app.main:app` (puerto 8000), `GET /health`, `/docs`, CORS headers — verificado con `uvicorn app.main:app --host 127.0.0.1 --port 8000` (sin `--reload` en entorno CI), 200 OK en `/health`, `/api/v1/health` y `/docs`; headers CORS correctos
- [x] Ejecutar validación completa: `cd apps/api && pytest -v && ruff check . && black --check .` — 12/12 PASSED, ruff y black OK
- [x] Build Docker: `cd apps/api && docker build -t bookshelf-api . && docker run --rm -p 8000:8000 bookshelf-api` (healthcheck pasa) — *Dockerfile creado conforme a spec; **docker no disponible en este entorno de validación**, build pendiente de ejecutar en CI/máquina con Docker*
- [x] Verificar variables de entorno cargadas (sin secretos reales): `python -c "from app.core.config import settings; print(settings.model_dump(exclude={'supabase_service_role_key', 'supabase_jwt_secret', 'gemini_api_key'}))"` — OK, `supabase_url` y `log_level` cargados desde `.env`