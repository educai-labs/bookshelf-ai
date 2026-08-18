# 006 · FastAPI Scaffold — Plan

**Estado:** borrador

## Enfoque

Se construirá el scaffold completo de la aplicación FastAPI en `apps/api/` siguiendo una estrategia **modular por capas** que respete estrictamente la arquitectura definida en `tech-stack.md` (líneas 33-41) y los principios de la constitución:

1. **Estructura de carpetas** replicando exactamente `app/{core,api/v1,services,models,db}` para aislar responsabilidades y permitir inyección de features 007-010 sin refactor.
2. **Configuración centralizada** con `Pydantic-Settings` (v2) cargando desde `.env` — único source of truth para secrets y settings, sin hardcodeo (límite duro tech-stack línea 143).
3. **Lifespan** (`contextlib.asynccontextmanager` en `main.py`) para inicializar/cerrar cliente Supabase (`service_role`) y cliente HTTP (`httpx.AsyncClient`) — garantiza recursos limpios al arranque/apagado (principio streaming-first).
4. **CORS** restrictivo a `http://localhost:3000` (dev frontend Next.js) con `allow_credentials=True` para cookies/JWT.
5. **Logging estructurado** con `structlog`: procesador JSON en producción (`LOG_LEVEL=INFO`), pretty console en desarrollo (`LOG_LEVEL=DEBUG`).
6. **Health check** mínimo en `/health` (GET) para load balancers y Docker healthcheck.
7. **Dependencias** declaradas en `pyproject.toml` (PEP 621) con versiones compatibles Python 3.11+; lockfile opcional vía `pip-tools` o `uv`.
8. **Dockerfile multi-stage** (builder → runtime `python:3.11-slim`) con healthcheck exponiendo `/health`; imagen final < 200 MB.
9. **Tests mínimos** con `pytest + httpx.AsyncClient`: health check + mock de dependency `get_current_user`.
10. **Lint/Format** obligatorios: `ruff check . && black --check .` en CI y pre-commit.

Este enfoque evita decisiones que contradigan `tech-stack.md`: no se usa `service_role` en frontend, no se hardcodean URLs, se respeta estructura de módulos, y las dependencias listadas en la spec son exactamente las permitidas.

## Implementación

| Paso | Acción | Archivos / Módulos afectados |
|------|--------|------------------------------|
| 1 | Crear estructura de directorios `apps/api/app/{core,api/v1/endpoints,services,models,db}` + `__init__.py` | `apps/api/app/` (árbol completo) |
| 2 | Escribir `pyproject.toml` con dependencias: `fastapi`, `uvicorn[standard]`, `pydantic`, `pydantic-settings`, `supabase`, `httpx`, `structlog`, `python-dotenv`, `pytest`, `pytest-asyncio`, `ruff`, `black` | `apps/api/pyproject.toml` |
| 3 | Crear `.env.example` con variables: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `GEMINI_API_KEY`, `LOG_LEVEL` | `apps/api/.env.example` |
| 4 | Implementar `core/config.py`: clase `Settings` (Pydantic-Settings v2) con `model_config = SettingsConfigDict(env_file=".env", extra="ignore")` y campos tipados | `apps/api/app/core/config.py` |
| 5 | Implementar `core/logging.py`: `configure_logging(settings.log_level)` → `structlog.configure()` con `JSONRenderer` (prod) / `ConsoleRenderer` (dev); exportar `get_logger` | `apps/api/app/core/logging.py` |
| 6 | Implementar `core/database.py`: singleton `SupabaseClient` (`supabase.create_client`) + `AsyncClient` (`httpx.AsyncClient`); funciones `get_supabase()` y `get_http_client()` para `Depends`; lifecycle start/close | `apps/api/app/core/database.py` |
| 7 | Implementar `core/security.py`: `verify_jwt(token)` usando `SUPABASE_JWT_SECRET` (HS256, `python-jose` o `PyJWT`); dependency `get_current_user` → extrae `user_id` del payload verificado | `apps/api/app/core/security.py` |
| 8 | Implementar `api/v1/router.py`: `APIRouter(prefix="/api/v1")`; incluye `health.router` (y futuros routers) | `apps/api/app/api/v1/router.py` |
| 9 | Implementar `api/v1/endpoints/health.py`: `GET /health` → `{"status": "ok"}` | `apps/api/app/api/v1/endpoints/health.py` |
| 10 | Implementar `main.py`: `FastAPI(lifespan=lifespan)`, CORS middleware, `include_router(v1_router)`, exception handlers globales, configuración de logging al inicio | `apps/api/app/main.py` |
| 11 | Implementar `lifespan` en `main.py`: `asynccontextmanager` que llama `await init_db()` / `await close_db()` (de `core.database`) y `configure_logging()` | `apps/api/app/main.py` |
| 12 | Crear `Dockerfile` multi-stage: **builder** (instala deps con `pip install --no-cache-dir -r requirements.txt` generado desde `pyproject.toml`), **runtime** (`python:3.11-slim`, copia artefactos, usuario no-root, `HEALTHCHECK CMD curl -f http://localhost:8000/health || exit 1`, `CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]`) | `apps/api/Dockerfile` |
| 13 | Crear `tests/test_health.py`: test `GET /health` con `httpx.AsyncClient` (app=FastAPI) → assert 200 + JSON | `apps/api/tests/test_health.py` |
| 14 | Crear `tests/test_auth.py`: mock `get_current_user` dependency override → test endpoint protegido (placeholder) | `apps/api/tests/test_auth.py` |
| 15 | Configurar `pytest.ini` o `pyproject.toml` `[tool.pytest.ini_options]`: `asyncio_mode = "auto"`, `testpaths = ["tests"]` | `apps/api/pyproject.toml` |
| 16 | Verificar localmente: `cd apps/api && uvicorn app.main:app --reload` (puerto 8000), `GET /health`, `/docs`, CORS headers | Terminal |
| 17 | Ejecutar validación completa: `cd apps/api && pytest -v && ruff check . && black --check .` | Terminal |
| 18 | Build Docker: `cd apps/api && docker build -t bookshelf-api . && docker run --rm -p 8000:8000 bookshelf-api` (healthcheck pasa) | Terminal |

> **Nota**: Los módulos `services/`, `models/`, `db/` se crean vacíos (`__init__.py` only) en este scaffold; las features 007-010 los poblarán.

## Decisiones

| Decisión | Justificación | Alternativa descartada |
|----------|---------------|------------------------|
| **Estructura `app/{core,api/v1,services,models,db}`** | Coincide exactamente con `tech-stack.md` líneas 34-39; separación clara: core (config, security, lifespan, logging), api/v1 (routers versionados), services (lógica de negocio externa: ISBN, embeddings, chat), models (Pydantic request/response), db (Supabase client, helpers). | Aplanar todo en `app/` — crece desordenado, dificulta testing y ownership. |
| **Pydantic-Settings v2 (`SettingsConfigDict`)** | Estándar moderno, validación de tipos, `.env` automático, `extra="ignore"` evita errores por vars extra. | `python-dotenv` + clase manual — sin validación, propenso a typos. |
| **Lifespan con `asynccontextmanager` en `main.py`** | FastAPI 0.110+ recomienda lifespan sobre `on_event`; permite `yield` con cleanup garantizado incluso en excepciones. | `@app.on_event("startup")` / `"shutdown"` — deprecated, no maneja errores en startup tan limpio. |
| **Supabase client `service_role` singleton en `core/database.py`** | Un solo cliente por proceso, reutilizado vía `Depends(get_supabase)`; `service_role` bypassa RLS para operaciones de sistema (vectorización, admin) — respeta límite duro línea 141. | Crear cliente por request — overhead de conexiones, pool innecesario (Supabase maneja pool server-side). |
| **`httpx.AsyncClient` singleton aparte** | Para llamadas HTTP externas (Open Library, Google Books, Gemini) con pooling, timeouts, retries configurables. | `requests` sync — bloquea event loop; `aiohttp` — dependencia extra, `httpx` ya está en deps por FastAPI test client. |
| **CORS restrictivo a `localhost:3000` + `allow_credentials=True`** | Frontend Next.js corre en 3000; cookies/JWT en headers requieren credentials. En prod se ampliará via variable de entorno. | `allow_origins=["*"]` — inseguro, no permite credentials. |
| **Structlog con `JSONRenderer` (prod) / `ConsoleRenderer` (dev)** | Logs estructurados parseables en agregadores (Datadog, Loki, CloudWatch); pretty en dev para legibilidad. `LOG_LEVEL` controla verbosidad. | `logging` stdlib básico — sin estructura, difícil query/alerting. |
| **Health check en `/health` (no `/api/v1/health`)** | Estándar de load balancers (Render, AWS ALB, K8s liveness/readiness); Docker `HEALTHCHECK` apunta a raíz. | Versionado bajo `/api/v1` — rompe healthchecks de infra que esperan `/health`. |
| **Docker multi-stage `python:3.11-slim`** | Imagen final mínima (~100 MB), sin build tools; `slim` tiene glibc completo para wheels binarios. `HEALTHCHECK` nativo usa `/health`. | `python:3.11-alpine` — wheels incompatibles (musl), builds lentos, debugging difícil. |
| **Tests con `httpx.AsyncClient(app=app, base_url="http://test")`** | Test client nativo FastAPI, sin red real, rápido, soporta lifespan y dependencies override. | `TestClient` sync — no prueba código async real; `pytest-asyncio` + `httpx` real — requiere servidor corriendo. |
| **Dependencias exactas de la spec (sin extras)** | Respeta límite duro línea 139: "No añadir dependencias sin justificación en PR". Cada una tiene propósito claro. | Añadir `python-jose` para JWT — `PyJWT` basta (stdlib `cryptography` opcional); `pydantic[email]` — no necesario aún. |

## Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| **Versiones de dependencias incompatibles (pydantic v2 vs v1, supabase-py breaking changes)** | Media | Alto (build/test fallan) | Fijar versiones compatibles en `pyproject.toml` (ej. `pydantic>=2.8,<3`, `supabase>=2.0,<3`, `httpx>=0.27,<1`). Probar `pip install` limpio en Docker builder. |
| **`SUPABASE_JWT_SECRET` no coincide con el del proyecto Supabase** | Alta (config manual) | Crítico (auth rota, 401 en todos los endpoints protegidos) | Documentar en `.env.example` y README: obtener de Dashboard → Settings → Auth → JWT Secret. Validar en test mock. |
| **CORS bloquea frontend en dev (puerto 3000 vs 8000)** | Media | Medio (frontend no puede llamar a API) | Verificar `allow_origins=["http://localhost:3000"]` y `allow_credentials=True`. Probar con `curl -H "Origin: http://localhost:3000" -v`. |
| **Lifespan no cierra clientes en shutdown abrupto (SIGKILL, OOM kill)** | Baja | Medio (conexiones huérfanas, logs de error) | `httpx.AsyncClient` y Supabase client tienen timeouts; Supabase server-side cierra idle connections. No crítico para dev. |
| **Structlog JSON output no parseable por agregador (campos faltantes)** | Baja | Bajo (observabilidad limitada) | Configurar `structlog.stdlib.add_log_level`, `structlog.processors.TimeStamper(fmt="iso")`, `structlog.processors.dict_tracebacks`. Test: `LOG_LEVEL=INFO python -c "from app.core.logging import get_logger; get_logger().info('test')"` → validar JSON válido. |
| **Docker healthcheck falla por timing (app no lista cuando healthcheck corre)** | Media | Alto (container marked unhealthy, restart loop) | `HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 CMD ...`. `start-period` da margen a arranque. |
| **Tests lentos por lifespan real (conexión Supabase real en test)** | Media | Medio (CI lento, flakiness) | Tests usan `app` test client sin red real; `get_supabase` y `get_current_user` se overrdean con mocks en `conftest.py`. No conexión real en unit tests. |
| **`ruff`/`black` conflictos de estilo (line length, quotes)** | Baja | Bajo (CI falla) | Configurar en `pyproject.toml`: `[tool.ruff] line-length = 100`, `[tool.black] line-length = 100`. Ejecutar `ruff check --fix` antes de commit. |
| **Falta `python-jose` o `PyJWT` en deps para `security.py`** | Media | Alto (ImportError) | Añadir `PyJWT>=2.8,<3` a `pyproject.toml` (dependencia implícita de `security.py`). Justificación: verificación JWT HS256 sin llamar a Supabase. |

## Validación

La feature se considera completa cuando **todos** los siguientes comandos pasan en orden desde `apps/api/`:

```bash
# 1. Instalación de dependencias (entorno virtual recomendado)
pip install -e ".[dev]"  # o: pip install -r requirements.txt (generado desde pyproject.toml)

# 2. Arranque local y verificación manual
uvicorn app.main:app --reload
# → GET http://localhost:8000/health  → 200 {"status":"ok"}
# → GET http://localhost:8000/docs    → Swagger UI carga
# → curl -H "Origin: http://localhost:3000" -v http://localhost:8000/health → Access-Control-Allow-Origin: http://localhost:3000

# 3. Suite de tests (pytest + httpx)
pytest -v
# → test_health.py::test_health_check PASSED
# → test_auth.py::test_get_current_user_mock PASSED

# 4. Lint + Format (ruff + black)
ruff check .
black --check .

# 5. Build Docker + healthcheck
docker build -t bookshelf-api .
docker run --rm -d -p 8000:8000 --name api-test bookshelf-api
sleep 15  # wait for healthcheck start-period
docker inspect api-test --format='{{.State.Health.Status}}'  # → "healthy"
docker stop api-test

# 6. Verificar variables de entorno cargadas (sin secretos reales)
python -c "from app.core.config import settings; print(settings.model_dump(exclude={'supabase_service_role_key', 'supabase_jwt_secret', 'gemini_api_key'}))"
```

**Criterios de aceptación mapeados a validación:**

| Criterio (spec.md) | Validación |
|---------------------|------------|
| `uvicorn app.main:app --reload` arranca en puerto 8000 sin errores | Paso 2 |
| `GET /health` retorna `200` + JSON `{status: "ok"}` | Paso 2 + test_health |
| CORS configurado: `allow_origins=["http://localhost:3000"]`, `allow_credentials=True` | Paso 2 (curl manual) |
| Settings cargan desde `.env` (Pydantic-Settings): 5 vars requeridas | Paso 6 |
| Supabase client (service_role) inicializado en `core/database.py` y accesible vía `Depends(get_supabase)` | Implementación pasos 6, 11 + test mock |
| Lifespan inicia cliente Supabase al arranque y cierra conexiones al apagado | Paso 11 (logs de inicio/cierre) |
| Logging estructurado JSON en stdout (`LOG_LEVEL=INFO`), pretty console en dev (`LOG_LEVEL=DEBUG`) | Paso 2 (observar logs) + test manual |
| OpenAPI docs accesibles en `/docs` | Paso 2 |
| `pytest -v` pasa (health check + auth dependency mock) | Paso 3 |
| `ruff check . && black --check .` pasa sin errores | Paso 4 |

---

**Próximo paso**: Una vez aprobado este plan, el **descomponedor** generará `tasks.md` con checklist granular para el implementador.