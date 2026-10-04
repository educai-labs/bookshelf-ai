# Despliegue en producción — Bookshelf (feature 020)

Este documento describe cómo desplegar Bookshelf en producción con una
restricción dura de **coste 0 EUR/mes**, apoyada exclusivamente en free tiers.

**Arquitectura**

| Servicio | Plataforma | Plan / tier | URL por defecto |
|---|---|---|---|
| Frontend (Next.js) | Vercel | Hobby (gratuito) | `https://<proyecto>.vercel.app` |
| Backend (FastAPI) | Google Cloud Run | Free tier (scale-to-zero) | `https://<servicio>-<hash>-<region>.run.app` |
| Base de datos / Auth | Supabase | Free (managed) | `https://<project-ref>.supabase.co` |
| IA / Embeddings | Gemini API | Free tier | — |

El frontend llama al backend mediante el **rewrite server-side** de
`apps/web/next.config.mjs`: `/api/v1/:path*` → `process.env.API_URL`. El
navegador solo ve URLs relativas; la URL del backend (Cloud Run) nunca se expone
al cliente. **No existe `NEXT_PUBLIC_API_URL`.**

---

## 1. Prerrequisitos

- Cuenta **GitHub** con el repositorio `bookshelf`.
- Cuenta **Vercel** (plan Hobby, uso no comercial).
- Cuenta **Google Cloud** con **billing habilitado** (obligatorio aunque el
  coste objetivo sea 0 EUR/mes) y el proyecto GCP seleccionado.
- Proyecto **Supabase** (free) con el esquema remoto ya aplicado.
- CLI opcionales: `gcloud`, `vercel`, `supabase`, `docker`.

---

## 2. Frontend — Vercel (plan Hobby)

1. En Vercel: **Add New Project** → importa el repositorio de GitHub.
2. Framework preset: **Next.js** (`framework: "nextjs"`), build command
   `npm run build`, output directory `.next` (usa `output: "standalone"` ya
   configurado en `apps/web/next.config.mjs`).
3. **Deployments**: deja activados los **preview deployments por pull request**
   (cada PR genera su URL de preview).
4. Dominio: el sitio se sirve en la **URL por defecto de Vercel Hobby**
   `https://<proyecto>.vercel.app` con HTTPS/SSL gestionado por la plataforma.
   **No** se configura dominio personalizado (ver *Fuera de alcance* del spec).
5. Env vars de Vercel (Settings → Environment Variables), **sin**
   `NEXT_PUBLIC_API_URL`:

   | Variable | Valor |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | clave **anon public** de Supabase |
   | `NEXT_PUBLIC_SITE_URL` | `https://<proyecto>.vercel.app` |
   | `API_URL` | URL por defecto de Cloud Run (ver §3) |

> La integración Git de Vercel gestiona previews y producción automáticamente
> (PR → preview; merge a `main` → producción). **No se usa `VERCEL_TOKEN`** ni
> un pipeline de Vercel en GitHub Actions.

---

## 3. Backend — Google Cloud Run (región europea)

1. En Google Cloud, crea/selecciona el proyecto con billing. Elige la región
   **`europe-west1`** (o `europe-southwest1`) **antes** del alta.
2. **Artifact Registry**: crea el repositorio de Docker (p. ej. `bookshelf`)
   en la región elegida.
3. **Cloud Run**: crea el servicio (p. ej. `bookshelf-api`) con:
   - Runtime **Docker**, imagen desde Artifact Registry.
   - **1 vCPU / 512 MB**, mínimo **0** instancias, máximo **1** (scale-to-zero,
     sin autoscaling horizontal).
   - Puerto **8000**, health check **`GET /health`**.
   - **CPU always allocated** (`--no-cpu-throttling`) — imprescindible para no
     congelar la CPU entre requests y no interrumpir la vectorización de notas
     (feature 016).
   - **Acceso**: permitir invocaciones no autenticadas (la auth real es el JWT
     de Supabase en la app) para que el rewrite de Vercel lo alcance.
4. **Service account de runtime**: Cloud Run usa la **cuenta de servicio por
   defecto de Compute** del proyecto — **no se crea ninguna SA dedicada** para
   el servicio. Activa **Cloud Logging**.
5. Env vars de Cloud Run (Settings → Variables):

   | Variable | Valor |
   |---|---|
   | `APP_ENV` | `production` |
   | `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | clave **service_role** (solo backend) |
   | `SUPABASE_JWT_SECRET` | JWT Secret de Supabase |
   | `SUPABASE_JWKS_URL` | `https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json` |
   | `GEMINI_API_KEY` | clave de Gemini |
   | `GOOGLE_BOOKS_API_KEY` | clave de Google Books (opcional, fallback) |
   | `LOG_LEVEL` | `INFO` |
   | `LOG_FORMAT` | `json` |
   | `CORS_ORIGINS` | `https://<proyecto>.vercel.app` |

> La app falla al arranque si falta alguna credencial crítica en producción
> (**fail-fast**). CORS usa solo la URL oficial de producción (nunca `*`).

---

## 4. Workload Identity Federation (OIDC)

El deploy a Google Cloud **no usa claves JSON ni secretos de larga duración**.
Configura la federación:

1. En Google Cloud → IAM → **Workload Identity Federation**: crea un *Workload
   Identity Pool* y un *Provider* **OIDC** con issuer de GitHub
   (`https://token.actions.githubusercontent.com`), atributo `google.subject`
   restringido al repositorio, organización, rama/ref y service account
   autorizados.
2. Crea una **service account de despliegue** con permisos mínimos sobre
   Artifact Registry (`roles/artifactregistry.writer`) y Cloud Run
   (`roles/run.admin` + `roles/iam.serviceAccountUser` sobre la cuenta de
   servicio por defecto de Compute).
3. Guarda en GitHub como **Variables** (no secretos):
   `GCP_PROJECT_ID`, `ARTIFACT_REGISTRY`, `CLOUD_RUN_SERVICE`,
   `WIF_PROVIDER` (recurso completo del provider) y `WIF_SERVICE_ACCOUNT`
   (email de la service account de despliegue).

**No crear, descargar ni almacenar** claves JSON, archivos `.pem`,
`GOOGLE_APPLICATION_CREDENTIALS` ni `VERCEL_TOKEN`.

---

## 5. CI/CD — GitHub Actions

- **`.github/workflows/ci.yml`** — en PR y push a `main`: jobs
  `lint-frontend`, `lint-backend`, `test-frontend`, `test-backend`,
  `build-frontend` y `build-backend` (`docker build -t bookshelf-api .`).
- **`.github/workflows/deploy.yml`** — en merge a `main`: job `deploy` con
  `needs: ci` (reutiliza `ci.yml`), `permissions: contents: read` e
  `id-token: write`, y orden:
  1. **Gate de esquema** `npm run verify:schema`.
  2. **Autenticación** a Google Cloud vía `google-github-actions/auth` (WIF).
  3. **Build + push** de la imagen a Artifact Registry.
  4. **`gcloud run deploy`** con `--port=8000 --cpu=1 --memory=512Mi
     --min-instances=0 --max-instances=1 --no-cpu-throttling`.

El job `deploy` usa `environment: production`. En ese *environment* de GitHub se
definen los **Secrets** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y
`SUPABASE_DB_URL` (necesarios solo para el gate de esquema; Supabase no soporta
OIDC). Las env vars de producción viven en Cloud Run y Vercel, no en GitHub.

---

## 6. Comandos de validación

```bash
# Backend
cd apps/api && pytest
cd apps/api && ruff check .
cd apps/api && black --check .
cd apps/api && docker build -t bookshelf-api .

# Frontend
cd apps/web && npm run lint
cd apps/web && npm run test
cd apps/web && npm run build

# Gate de esquema (raíz)
npm run verify:schema
```

---

## 7. Gate de esquema (`npm run verify:schema`)

Antes de autenticar, construir o desplegar, `deploy.yml` ejecuta
`npm run verify:schema`, que comprueba **objeto a objeto** que el Supabase
remoto contiene: tablas `books`, `book_notes`, `account_preferences`; RPC
`match_book_notes`; extensión `vector`; e índice `idx_book_notes_embedding_hnsw`.

- **exit 0** = todo presente → continúa el deploy.
- **exit 1** = algún objeto ausente, error de red o de autenticación → el
  workflow **se detiene**. El script **redacta** URLs y secretos (nunca imprime
  la `service_role` key ni la URL completa del proyecto).

**Esta feature no crea ni modifica migraciones.** Si la verificación detecta
drift, el remedio es **manual y explícito** (no se auto-repara):

```bash
supabase db push --include-all   # aplica las migraciones pendientes
npm run verify:schema            # verifica de nuevo
```

`supabase/migrations/` es **append-only**: nunca modifiques una migración ya
aplicada; crea una migración nueva numerada si hace falta.

---

## 8. Health check

- Endpoint: **`GET /health`** → `{"status": "ok"}` (ya existente en el API).
- Cloud Run lo usa como health check; el `Dockerfile` incluye un `HEALTHCHECK`
  equivalente.
- Objetivo: **200 en menos de 1 segundo** en producción.
- Verificar: `curl -sS -o /dev/null -w "%{http_code}" https://<servicio>-<hash>-<region>.run.app/health`.

---

## 9. Logs

- **Backend**: stdout JSON estructurado (structlog, `LOG_FORMAT=json`) visible
  en **Cloud Logging**. La redacción automática elimina secretos (API keys,
  JWTs, cookies, service role keys) y contenido privado (notas/prompts).
- **Frontend**: logs visibles en **Vercel → Logs**.
- Revisar tras el despliegue que **no** aparecen secretos, tokens, cabeceras ni
  respuestas privadas.

---

## 10. Rollback

- **Cloud Run** (revisión a revisión anterior, sin blue/green):
  ```bash
  gcloud run services update-traffic <servicio> \
    --region europe-west1 \
    --to-revisions=<REVISION_ANTERIOR>=100
  ```
  (O en la consola: servicio → Revisions → **Manage traffic** → apunta el 100%
  del tráfico a la revisión anterior).
- **Vercel** (instant rollback):
  Dashboard → Project → **Deployments** → menú de la deployment de producción
  → **Promote to production** / **Rollback** sobre una deployment anterior.

---

## 11. Coste 0 EUR/mes — límites de free tiers

| Recurso | Límite free tier | Qué ocurre al superarlo |
|---|---|---|
| Vercel Hobby | Uso no comercial; ancho de banda y build time dentro de fair use | Vercel solicita subir a Pro (pago); **no factura automáticamente** |
| Google Cloud Run | 2M requests + 180.000 vCPU-s + 360.000 GiB-s al mes | Google **factura el exceso** a la cuenta de billing (obligatoria aunque el coste sea 0) |
| Supabase free | 500 MB DB, 1 GB storage, 50K usuarios activos/mes; pausa del proyecto tras 1 semana de inactividad | Pide subir de plan; el proyecto pausado se reactiva manualmente |
| Gemini API free tier | Cuotas RPM/RPD por modelo (chat + embeddings) | HTTP **429** al exceder cuota (frontend/backend muestran error y reintentan con backoff) |

**Salvaguardas obligatorias:**

- Configura en Google Cloud una **alerta de presupuesto de 0 USD/mes**
  (Billing → Budgets & alerts) y revisa el consumo de Cloud Run, Artifact
  Registry y demás recursos.
- Mantén **máximo 1 instancia** y **scale-to-zero** (min 0) para no consumir
  vCPU/GiB ocioso.
- Al cierre del primer mes, verifica que el consumo real es 0 EUR.

---

## 12. Verificación manual de extremo a extremo

1. Abre una **PR** → comprueba el **preview deployment** de Vercel (URL de
   preview por PR).
2. **Merge a `main`** → CI pasa → `deploy.yml` verifica esquema, construye y
   despliega en Cloud Run; Vercel despliega producción en
   `https://<proyecto>.vercel.app`.
3. Confirma que `/api/v1/*` se resuelve vía rewrite hacia Cloud Run y que
   `GET /health` responde **200 < 1s**.
4. Crea/edita una nota y deja el servicio **sin tráfico**: la vectorización
   (feature 016) debe **terminar** y el embedding quedar persistido (gracias a
   `--no-cpu-throttling`).
5. Revisa Cloud Logging y Vercel Logs: logs JSON visibles y sin secretos.
