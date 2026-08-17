# 020 · Production Deployment

**Estado:** propuesta

## Qué hace

Configura despliegue en producción para ambos servicios:

**Frontend → Vercel**:
- Conecta repo GitHub → Vercel project.
- Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_URL` (URL Render backend).
- Build command: `npm run build` (output `standalone` en `next.config.mjs`).
- Preview deployments en PRs.
- Custom domain: `bookshelf.educai.dev` (o similar) + SSL automático.
- Edge Config / Middleware para rate limiting básico (opcional).

**Backend → Render**:
- Dockerfile multi-stage (builder → runtime python:3.11-slim).
- Render Web Service: Docker runtime, puerto 8000, health check `GET /health`.
- Env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `GEMINI_API_KEY`, `GOOGLE_BOOKS_API_KEY`, `LOG_LEVEL=INFO`, `CORS_ORIGINS=https://bookshelf.educai.dev`.
- Autoscaling: min 1, max 3 instancias (CPU/memory based).
- Base de datos: **Supabase managed** (ya configurado, no Render PG).
- Logs: Render logs + estructurados JSON (structlog).

**CI/CD → GitHub Actions**:
- Workflow `ci.yml`: en PR/push a main → lint (frontend + backend), test (frontend + backend), build (Docker backend).
- Workflow `deploy.yml`: en merge a main → deploy backend a Render (via Render Deploy Hook o `render.com` action), deploy frontend a Vercel (auto via Vercel Git integration).
- Secrets en GitHub: `RENDER_API_KEY`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, plus todas las env vars de producción.

## Por qué

Separación frontend (Vercel, edge, static optimizado) + backend (Render, Docker, long-running) es arquitectura estándar moderna. Supabase gestiona DB/Auth — no hay que operar PostgreSQL. CI/CD automatiza calidad y despliegue. Preview deployments en PRs permiten revisión visual antes de merge.

## Criterios de aceptación

- [ ] `apps/web/vercel.json` (opcional) o config vía dashboard: `buildCommand`, `outputDirectory`, `framework: "nextjs"`.
- [ ] `apps/api/Dockerfile` multi-stage: `FROM python:3.11-slim AS builder` (instala deps, compila) → `FROM python:3.11-slim` (copia artifacts, usuario no-root, `CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]`).
- [ ] `docker-compose.yml` en raíz para dev local opcional (api + web + opcional supabase local).
- [ ] `.github/workflows/ci.yml`: jobs `lint-frontend`, `lint-backend`, `test-frontend`, `test-backend`, `build-backend` (push image a GHCR opcional).
- [ ] `.github/workflows/deploy.yml`: `needs: ci`, `if: github.ref == 'refs/heads/main'` → Render deploy hook + Vercel deploy (auto).
- [ ] Health check backend: `GET /health` retorna 200 < 1s en producción.
- [ ] CORS en backend: `allow_origins=[os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")]`.
- [ ] Verificación manual: PR → preview Vercel URL funcional; merge → producción en `bookshelf.educai.dev` + API en `api.bookshelf.educai.dev` (o subpath).
- [ ] Documentación `DEPLOY.md` con pasos, variables, rollback (Render rollback deploy, Vercel instant rollback).

## Fuera de alcance

- Observabilidad avanzada (Sentry, Datadog, Prometheus/Grafana) — logs Render + Vercel suficientes para MVP.
- CDN / Edge caching para assets (Vercel lo hace automático).
- Blue/green deployments / canary — Render rolling deploy + Vercel atomic deploy cubren.
- Backup/Restore Supabase (gestionado por Supabase).
- Infraestructura as Code (Terraform/Pulumi) — config vía dashboards para MVP.
- Staging environment separado — preview deployments sirven de staging.