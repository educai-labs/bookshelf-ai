# 020 · Production Deployment

**Estado:** en curso

## Qué hace

Configura despliegue en producción para ambos servicios, con una restricción dura de **coste 0 EUR/mes** apoyada en free tiers.

**Frontend → Vercel (plan Hobby, gratuito)**:
- Conecta repo GitHub → Vercel project (plan **Hobby**, uso no comercial).
- Env vars (coherentes con `.env.example` de la raíz): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL` (URL de producción por defecto de Vercel Hobby, `https://<proyecto>.vercel.app`) y `API_URL` (URL por defecto del servicio en Cloud Run, `https://<servicio>-<hash>-<region>.run.app`) — esta última es el destino del **rewrite server-side** de `next.config.mjs` (`/api/v1/*` → backend). El frontend **NO** usa `NEXT_PUBLIC_API_URL`.
- Build command: `npm run build` (output `standalone` en `next.config.mjs`).
- Preview deployments por cada PR en su URL de preview por defecto de Vercel.
- Dominio: se sirve en la **URL por defecto del proyecto en Vercel Hobby** — `https://<proyecto>.vercel.app` (HTTPS/SSL gestionado por la plataforma). **No** se configura dominio personalizado (ver *Fuera de alcance*).
- Rate limiting básico: se hace en backend (feature 021), no en edge — sin add-ons de pago del plan Hobby.

**Backend → Google Cloud Run (región europea)**:
- Imagen Docker del API construida desde `apps/api/Dockerfile` (multi-stage), publicada en **Artifact Registry**.
- Servicio Cloud Run en **`europe-west1`** (o `europe-southwest1`): runtime Docker, puerto 8000, health check `GET /health`. Expuesto por la **URL por defecto de Cloud Run** (`https://<servicio>-<hash>-<region>.run.app`), que se registra como `API_URL` en Vercel para el rewrite server-side del frontend.
- Dimensiones: **1 vCPU / 512 MB**. Escalado: **scale-to-zero** (mín. 0 instancias, máx. 1 — sin autoscaling horizontal en MVP).
- **CPU always allocated** habilitada (`--cpu-always-allocate`): sin ella Cloud Run congela la CPU de la instancia entre requests y **interrumpe las background tasks de vectorización de notas (feature 016)**. Mitigación obligatoria del riesgo de scale-to-zero.
- Env vars (coherentes con `.env.example` y feature 021; fail-fast si falta alguna obligatoria en producción): `APP_ENV=production`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `SUPABASE_JWKS_URL`, `GEMINI_API_KEY`, `GOOGLE_BOOKS_API_KEY`, `LOG_LEVEL=INFO`, `LOG_FORMAT=json`, `CORS_ORIGINS=https://<proyecto>.vercel.app` (URL de producción por defecto de Vercel Hobby, sin dominio custom).
- Base de datos: **Supabase managed free** (DB + Auth, ya configurado — no Cloud SQL).
- Logs: **Cloud Logging** (stdout JSON estructurado, structlog).

**CI/CD → GitHub Actions (sin secretos de larga duración)**:
- Workflow `ci.yml`: en PR/push a main → lint (frontend + backend), test (frontend + backend), build (imagen Docker del backend).
- Workflow `deploy.yml`: en merge a main → build + push de la imagen a Artifact Registry y `gcloud run deploy` del servicio; frontend auto-desplegado vía Vercel Git integration.
- Autenticación a Google Cloud mediante **Workload Identity Federation (OIDC)**: sin claves de cuenta de servicio ni `RENDER_API_KEY` en GitHub Secrets. El deploy a Vercel no requiere `VERCEL_TOKEN` (integración Git). Las env vars de producción viven en Cloud Run y Vercel, no en el repo ni en Secrets de GitHub.

**Coste 0 EUR/mes (restricción dura)** — límites de cada free tier y consecuencia al superarlos (documentados en `DEPLOY.md`):

| Recurso | Límite free tier | Qué ocurre al superarlo |
|---|---|---|
| Vercel Hobby | Uso no comercial, ancho de banda y build time dentro de fair use | Vercel solicita subir a Pro (pago); no factura automáticamente |
| Google Cloud Run | 2M requests + 180.000 vCPU-s + 360.000 GiB-s al mes | Google factura el exceso a la cuenta de billing (obligatoria aunque el coste sea 0) |
| Supabase free | 500 MB DB, 1 GB storage, 50K usuarios activos/mes; pausa del proyecto tras 1 semana de inactividad | Pide subir de plan; proyecto pausado se reactiva manualmente |
| Gemini API free tier | Cuotas RPM/RPD por modelo (chat + embeddings) | HTTP 429 al exceder cuota (frontend/backend muestran error y reintentan con backoff) |

- Salvaguarda: **alerta de presupuesto de 0 USD/mes** en la cuenta de billing de Google Cloud.

## Por qué

Separación frontend (Vercel, edge, static optimizado) + backend (Cloud Run, Docker, scale-to-zero) es arquitectura estándar moderna y **cumple la restricción dura de coste 0 EUR/mes**: Cloud Run escala a cero cuando no hay tráfico y su free tier (2M requests, 180.000 vCPU-s, 360.000 GiB-s) cubre holgadamente un MVP personal, igual que Vercel Hobby, Supabase free y Gemini free tier. La región europea acerca los datos a los usuarios. Cloud Run comparte ecosistema Google con Gemini y permite despliegue con imagen Docker estándar (sin vendor lock-in de la lógica de negocio). OIDC (Workload Identity Federation) elimina secretos de larga duración. Supabase gestiona DB/Auth — no hay que operar PostgreSQL. CI/CD automatiza calidad y despliegue; preview deployments en PRs permiten revisión visual antes de merge.

## Criterios de aceptación

- [ ] Proyecto Vercel en plan **Hobby** (gratuito): `buildCommand`/`framework: "nextjs"` vía dashboard (o `apps/web/vercel.json` opcional), output `standalone`, preview deployments por cada PR y sitio servido en la **URL por defecto de Vercel Hobby** `https://<proyecto>.vercel.app` con SSL/HTTPS automático de la plataforma (sin dominio personalizado).
- [ ] Env vars del frontend en Vercel coherentes con `.env.example`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL` = `https://<proyecto>.vercel.app` (URL de producción de Vercel) y `API_URL` = la URL por defecto de Cloud Run (rewrite server-side). **Sin** `NEXT_PUBLIC_API_URL` (el frontend no la usa).
- [ ] `apps/api/Dockerfile` multi-stage ya existente y verificado (`python:3.11-slim` builder → runtime, usuario no-root, `HEALTHCHECK` sobre `GET /health`, CMD uvicorn puerto 8000) sirve de base para la imagen publicada en **Artifact Registry**.
- [ ] Servicio Cloud Run desplegado en `europe-west1` (o `europe-southwest1`) con 1 vCPU / 512 MB, mínimo 0 / máximo 1 instancias (scale-to-zero) y puerto 8000.
- [ ] El API es accesible por su **URL por defecto de Cloud Run** (`https://<servicio>-<hash>-<region>.run.app`) y ese valor exacto es el registrado como `API_URL` en Vercel para el rewrite `/api/v1/*` del frontend.
- [ ] Cloud Run con **CPU always allocated** habilitada (`--cpu-always-allocate`).
- [ ] El endpoint `GET /health` (ya existente en el API) responde 200 < 1s en producción y lo usa Cloud Run como health check.
- [ ] Test manual de background tasks: crear/editar una nota y dejar el servicio sin tráfico → la vectorización (feature 016) **no se interrumpe** (embedding queda escrito) gracias a CPU always allocated.
- [ ] Env vars del backend en Cloud Run coherentes con `.env.example`/feature 021 (incl. `APP_ENV=production`, `SUPABASE_JWKS_URL` explícita y `LOG_FORMAT=json`); la app falla al arranque si falta alguna obligatoria (fail-fast).
- [ ] CORS en backend: `allow_origins=[os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")]`, con `CORS_ORIGINS` de producción = la **URL de producción por defecto de Vercel** (`https://<proyecto>.vercel.app`) — sin dominio custom y nunca `*`.
- [ ] Logs JSON estructurados del backend visibles en **Cloud Logging**; logs del frontend visibles en Vercel. Sin secretos en logs.
- [ ] `.github/workflows/ci.yml`: jobs `lint-frontend`, `lint-backend`, `test-frontend`, `test-backend`, `build-backend` en PR y push a main.
- [ ] `.github/workflows/deploy.yml`: `needs: ci`, `if: github.ref == 'refs/heads/main'` → push de imagen a Artifact Registry + `gcloud run deploy`; frontend auto vía Vercel Git integration.
- [ ] Autenticación del deploy a Google Cloud vía **Workload Identity Federation (OIDC)**: sin claves de cuenta de servicio ni secretos de larga duración en GitHub Secrets (permiso `id-token: write` en el workflow).
- [ ] Coste 0 EUR/mes verificado al cierre del primer mes: `DEPLOY.md` documenta los límites de cada free tier y qué ocurre al superarlos; alerta de presupuesto 0 USD activa en la cuenta de billing.
- [ ] `docker-compose.yml` en raíz para dev local opcional (api + web + opcional supabase local).
- [ ] Verificación manual: PR → URL de **preview deployment** de Vercel funcional; merge → producción en la **URL por defecto de Vercel Hobby** (`https://<proyecto>.vercel.app`) con la API alcanzable vía rewrite `/api/v1/*` hacia la URL por defecto de Cloud Run.
- [ ] Documentación `DEPLOY.md` con pasos, variables, rollback (Cloud Run: apuntar tráfico a la revisión anterior; Vercel: instant rollback) y límites de free tiers.

## Fuera de alcance

- **Dominio personalizado** (p. ej. `bookshelf.educai.dev`) — esta feature sirve el frontend en la URL por defecto de Vercel Hobby. Podrá añadirse en el futuro **SIN cambios de código**: basta con asociar el dominio en el proyecto de Vercel y actualizar los valores de `NEXT_PUBLIC_SITE_URL` (Vercel) y `CORS_ORIGINS` (Cloud Run).
- **Cloud SQL** / PostgreSQL auto-gestionado — la DB es Supabase managed (free).
- Observabilidad avanzada (Sentry, Datadog, Prometheus/Grafana) — Cloud Logging + Vercel logs suficientes para MVP (`SENTRY_DSN` queda reservado en 021).
- CDN avanzado / edge caching más allá de lo que Vercel Hobby da por defecto (Cloud CDN, reglas custom).
- **Autoscaling horizontal** en Cloud Run (más de 1 instancia) — contradice la restricción de coste 0 EUR/mes.
- Blue/green deployments / canary con traffic splitting — revisiones de Cloud Run (rollback a revisión anterior) + atomic deploy de Vercel cubren el MVP.
- Backup/Restore Supabase (gestionado por Supabase; límites del plan free documentados en `DEPLOY.md`).
- Infraestructura as Code (Terraform/Pulumi) — config vía `gcloud` y dashboards para MVP.
- Staging environment separado — preview deployments sirven de staging.
