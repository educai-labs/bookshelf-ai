# 006 · FastAPI Scaffold

**Estado:** `hecho`

## Qué hace

Scaffold inicial de la aplicación FastAPI en `apps/api/`, proporcionando la estructura modular base, configuración centralizada, ciclo de vida (lifespan), CORS, logging estructurado y health check. Esta feature senta las bases para las features 007-010 y cumple el principio "spec-first" del proyecto.

Estructura resultante:

```
apps/api/
├── app/
│   ├── __init__.py
│   ├── main.py                 # FastAPI app, lifespan, routers inclusion, exception handlers
│   ├── core/
│   │   ├── __init__.py
│   │   ├── config.py           # Settings (Pydantic-Settings, .env) con SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET, GEMINI_API_KEY, LOG_LEVEL
│   │   ├── security.py         # JWT verification (HS256), get_current_user dependency
│   │   ├── logging.py          # Structlog config: JSON en prod, pretty console en dev
│   │   └── database.py         # Supabase client (service_role) singleton; lifespan start/close
│   ├── api/v1/
│   │   ├── __init__.py
│   │   ├── router.py           # APIRouter con prefix=/api/v1
│   │   └── endpoints/
│       ├── __init__.py
│       └── health.py           # GET /health
├── pyproject.toml              # deps: fastapi, uvicorn, pydantic v2, pydantic-settings, supabase, httpx, structlog, python-dotenv, pytest, pytest-asyncio, ruff, black
├── Dockerfile                  # multi-stage: builder + runtime (python:3.11-slim); healthcheck expone /health
├── .env.example                # vars específicas API (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, etc.)
└── alembic/                    # (opcional, migraciones si se usa)
```

## Por qué

Scaffold sólido evitando refactores masivos luego. Esta base cumple la misión "bibliotecas personales inteligentes" al proveer:

- **Backend FastAPI** listo para API REST + WebSocket/SSE (features 017, 019).
- **Configuración centralizada** via Pydantic-Settings y .env (principio ISBN key: todas las claves de servicios vienen del entorno, sin hardcodear).
- **Lifespan** que inicia cierra clientes Supabase y conexiones HTTP, garantizando recursos limpios (principio streaming-first: los recursos están listos cuando la app inicia).
- **CORS y health check** son requisitos para despliegue en Render/load balancers y para el frontend Next.js (puerto 3000).
- **Estructura modular** (`core`, `api/v1`, `services`, `models`, `db`) permite escalar y testear aisladamente, alineado con el principio "especificación antes que código": cada feature (007-010) podrá inyectarse en este scaffold sin alterar la base.

Esta feature es la base sobre la cual se construirán las features 007 (modelos Pydantic), 008 (ISBN Lookup), 009 (Books CRUD) y 010 (Notes CRUD).

## Criterios de aceptación

- [ ] `uvicorn app.main:app --reload` arranca en puerto 8000 sin errores.
- [ ] `GET /health` retorna `200` + JSON `{status: "ok"}`.
- [ ] CORS configurado: `allow_origins=["http://localhost:3000"]` (dev), `allow_credentials=True`.
- [ ] Settings cargan desde `.env` (Pydantic-Settings): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `GEMINI_API_KEY`, `LOG_LEVEL`.
- [ ] Supabase client (service_role) inicializado en `core/database.py` y accesible vía `Depends(get_supabase)`.
- [ ] Lifespan inicia cliente Supabase al arranque y cierra conexiones al apagado.
- [ ] Logging estructurado JSON en stdout cuando `LOG_LEVEL=INFO`, pretty console en dev cuando `LOG_LEVEL=DEBUG`.
- [ ] OpenAPI docs accesibles en `/docs` (FastAPI default) y retornan definición de rutas versionada.
- [ ] `pytest -v` pasa (mínimo: test de health check + auth dependency mock).
- [ ] `ruff check . && black --check .` pasa sin errores.

## Fuera de alcance

- Endpoints reales de books/notes/ai/lookup (features 008-010, 017).
- Modelos Pydantic request/response (feature 007).
- Cliente Supabase browser (feature 011).
- Despliegue a Render (feature 020).
- Autenticación JWT completa con refresh tokens (solo dependency `get_current_user` de verificación).
- Servicios ISBN/embeddings/vectorización (features 008, 016).
- MCP server (feature 019).
- Frontend Next.js o UI (feature 011).