# 006 · FastAPI Scaffold

**Estado:** propuesta

## Qué hace

Inicializa el proyecto FastAPI en `apps/api/` con estructura modular, configuración centralizada, lifespan, CORS, logging estructurado, health check y cliente Supabase server-side.

Estructura:
```
apps/api/
├── app/
│   ├── __init__.py
│   ├── main.py                 # FastAPI app, lifespan, routers, exception handlers
│   ├── core/
│   │   ├── __init__.py
│   │   ├── config.py           # Settings (Pydantic-Settings, .env)
│   │   ├── security.py         # JWT verification, get_current_user dependency
│   │   ├── logging.py          # Structlog config (JSON en prod, console en dev)
│   │   └── database.py         # Supabase client (service_role) singleton
│   ├── api/v1/
│   │   ├── __init__.py
│   │   ├── router.py           # APIRouter prefix=/api/v1
│   │   ├── endpoints/
│   │   │   ├── __init__.py
│   │   │   ├── health.py       # GET /health
│   │   │   ├── books.py        # (placeholder, feature 009)
│   │   │   ├── notes.py        # (placeholder, feature 010)
│   │   │   ├── ai.py           # (placeholder, feature 017)
│   │   │   └── lookup.py       # (placeholder, feature 008)
│   ├── services/               # (vacío, features 008, 016, 017)
│   ├── models/                 # (feature 007)
│   └── db/                     # helpers migraciones (opcional)
├── pyproject.toml              # deps: fastapi, uvicorn, pydantic, pydantic-settings, supabase, httpx, python-jose, structlog, python-dotenv, pytest, pytest-asyncio, ruff, black
├── Dockerfile                  # multi-stage: builder + runtime (python:3.11-slim)
├── .env.example                # vars específicas API
└── alembic/                    # (opcional, si se usa Alembic para migraciones)
```

## Por qué

Un scaffold sólido evita refactores masivos luego. Separar `core` (config, seguridad, DB) de `api/v1` (routers) y `services` (lógica de negocio) permite escalar y testear aisladamente. `lifespan` gestiona recursos (clientes HTTP, pool DB). Health check es requisito para Render/load balancers.

## Criterios de aceptación

- [ ] `uvicorn app.main:app --reload` arranca en puerto 8000 sin errores.
- [ ] `GET /health` retorna `{"status": "ok", "version": "x.y.z"}` (200).
- [ ] CORS configurado: `allow_origins=["http://localhost:3000"]` (dev), credentials=True.
- [ ] Settings cargan desde `.env` (Pydantic-Settings): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `GEMINI_API_KEY`, `OPENAI_API_KEY` (opcional), `LOG_LEVEL`.
- [ ] Supabase client (service_role) inicializado en `core/database.py` y accesible via `Depends(get_supabase)`.
- [ ] Dependency `get_current_user` en `core/security.py`: verifica JWT `Authorization: Bearer <token>` contra `SUPABASE_JWT_SECRET` (HS256), extrae `user_id` (sub claim), lanza `HTTPException(401)` si inválido/expirado.
- [ ] Logging JSON en producción (`LOG_LEVEL=INFO`), pretty console en dev (`LOG_LEVEL=DEBUG`).
- [ ] `Dockerfile` builda imagen < 200MB, healthcheck `curl -f http://localhost:8000/health || exit 1`.
- [ ] `pytest -v` pasa (test mínimo: health check + auth dependency mock).
- [ ] `ruff check . && black --check .` pasa.

## Fuera de alcance

- Endpoints reales de books/notes/ai/lookup (features 008-010, 017).
- Modelos Pydantic request/response (feature 007).
- Cliente Supabase browser (feature 011).
- Despliegue a Render (feature 020).