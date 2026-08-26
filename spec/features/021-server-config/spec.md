# 021 · Server Config

**Estado:** hecho

## Qué hace

Sistema de configuración centralizada del servidor y del desarrollador, basado en Pydantic-Settings, en `apps/api/app/core/config.py`. Cubre toda la configuración técnica, de infraestructura, seguridad e integraciones. Las configuraciones del servidor **nunca** se exponen al navegador.

Secciones cubiertas (2.1–2.7 del mini-doc):

1. **Entorno** — `APP_ENV` (`development` | `test` | `production`), `DEBUG`, `APP_VERSION`, `API_HOST`, `API_PORT`.
2. **Base de datos y Supabase** — `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `SUPABASE_JWKS_URL`, `SUPABASE_DB_TIMEOUT_SECONDS`. La `SERVICE_ROLE_KEY` es solo de backend/procesos internos; **nunca** llega al frontend.
3. **Inteligencia artificial** — `GEMINI_API_KEY`, `GEMINI_CHAT_MODEL` (default `gemini-3.5-flash`), `GEMINI_TIMEOUT_SECONDS`, `CHAT_STREAM_TIMEOUT_SECONDS` (default 60). `EMBEDDING_MODEL` y `EMBEDDING_DIMENSIONS` son **constantes fijas** (`text-embedding-004`, 768): el modelo de embeddings **no puede cambiarse** sin re-vectorización explícita de las notas existentes.
4. **Frontend y CORS** — `CORS_ORIGINS` (distinto por entorno; en producción solo dominios oficiales), `NEXT_PUBLIC_SITE_URL`, `API_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
5. **Servicios externos** — `GOOGLE_BOOKS_API_KEY` (opcional; Open Library primario), `OPEN_LIBRARY_TIMEOUT_SECONDS`, `ISBN_CACHE_TTL_SECONDS`, `ISBN_RATE_LIMIT_PER_MINUTE`.
6. **Logs y monitorización** — `LOG_LEVEL` (`DEBUG`/`INFO`/`WARNING`/`ERROR`), `LOG_FORMAT` (`console`/`json`), `SENTRY_DSN` (opcional), `ENABLE_REQUEST_LOGGING`, `ENABLE_METRICS`. Los logs **nunca** incluyen: API keys, JWTs, cookies, service role keys, contenido privado completo de notas, ni prompts privados del usuario.
7. **Seguridad** — `AUTH_REQUIRED`, `ACCESS_TOKEN_EXPIRE_MINUTES`, `MAX_REQUEST_BODY_SIZE_MB`, `RATE_LIMIT_ENABLED`, `RATE_LIMIT_REQUESTS_PER_MINUTE`, `TRUSTED_PROXY_IPS`. En producción las credenciales críticas son obligatorias; la app **falla al arranque** si faltan.

Características transversales: settings tipados con Pydantic v2; valores inválidos producen errores claros; config independiente para tests (override sin tocar `.env` real); documentada en `.env.example`; compatible con dev local, tests y producción. La config del servidor se carga al arranque (inmutable en runtime); no acopla ni cachea las preferencias de usuario (feature 022), que sí cambian en vivo sin reiniciar el servidor.

## Por qué

La configuración centralizada, tipada y validada evita errores en runtime, garantiza que los secretos no se filtren al frontend ni a los logs, y permite un *fail-fast* en producción cuando falta una credencial crítica. Pydantic-Settings integra con FastAPI: carga `.env`, valida tipos y expone un `settings` inyectable. Es **prerrequisito de seguridad** para Production Deployment (020): sin validación estricta de entorno, el despliegue en producción expone secretos o arranca con config incompleta.

## Criterios de aceptación

- [ ] `apps/api/app/core/config.py` define una clase `Settings(BaseSettings)` con **todas** las variables de las secciones 2.1–2.7, expuesta como `settings` (singleton) e inyectable en FastAPI.
- [ ] `.env.example` documenta **todas** las variables con comentario breve y valor de ejemplo (sin secretos reales), cubriendo los entornos dev/test/production.
- [ ] Tipado Pydantic: `APP_ENV`, `LOG_LEVEL` y `LOG_FORMAT` son enums; `API_PORT`, timeouts y `*_PER_MINUTE` son `int` positivos; las URLs son `HttpUrl`; los flags booleanos tienen defaults explícitos.
- [ ] `EMBEDDING_MODEL` y `EMBEDDING_DIMENSIONS` son **constantes fijas** (`text-embedding-004`, `768`), no seteables por env; un intento de sobreescribirlas vía env es ignorado o rechazado (decisión documentada en `plan.md`).
- [ ] `GEMINI_CHAT_MODEL` tiene default `gemini-3.5-flash` y es configurable vía env.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` **no aparece en el bundle del frontend**: `grep -r "SERVICE_ROLE_KEY" apps/web` no devuelve referencias (límite duro de tech-stack).
- [ ] Redacción de logs: un filtro/middleware redacta API keys, JWTs, cookies, service role keys, contenido completo de notas y prompts privados antes de emitir cualquier log (verificable con un test que loguea un valor sensible y comprueba que no aparece en la salida).
- [ ] Fail-fast en producción: con `APP_ENV=production`, si falta una credencial crítica (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `GEMINI_API_KEY`, etc.), el arranque aborta con un error que indica **qué variable falta**.
- [ ] `CORS_ORIGINS` se parsea por entorno; en `production` solo admite los dominios oficiales configurados (nunca `*`).
- [ ] Config independiente para tests: existe un mecanismo (p. ej. `Settings` instanciable con overrides, fixtures o `monkeypatch`) que permite correr tests sin tocar el `.env` real ni secretos.
- [ ] Valores inválidos (p. ej. `APP_ENV=staging`, `API_PORT=not-an-int`, `GEMINI_TIMEOUT_SECONDS=-1`) producen un `ValidationError` de Pydantic con el campo y la razón identificados.
- [ ] Tests backend: config válida carga OK; config inválida lanza `ValidationError` con campo identificado; missing creds en `production` aborta el arranque; redacción de logs verificada; y un test de no-regresión confirma que `SERVICE_ROLE_KEY` no se referencia en `apps/web`.

## Fuera de alcance

- Settings del cliente/UI (tema, idioma, preferencias de lector/chat, notificaciones, privacidad, accesibilidad) → **feature 022**.
- i18n de la interfaz → **feature 022**.
- Endpoints para modificar la config del servidor desde la UI en runtime: la config del servidor se carga al arranque (cambios via env requieren reinicio — comportamiento esperado y documentado).
- Infraestructura de despliegue concreta (Vercel/Render/CI) → **feature 020**; 021 solo provee la config que 020 consume.
- Observabilidad avanzada (dashboards Sentry/Prometheus, alerting) → **feature 020**; 021 solo habilita `SENTRY_DSN`/`ENABLE_METRICS` como flags.
- Rotación automática de secretos / vault externo (HashiCorp Vault, AWS Secrets Manager) — feature futura.
