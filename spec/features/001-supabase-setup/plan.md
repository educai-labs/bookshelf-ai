---
feature: "001-supabase-setup"
status: "propuesta"
created: "2026-08-15"
---

# Plan: 001 · Supabase Project Setup

## Enfoque

Configuración inicial del proyecto Supabase usando una estrategia **híbrida Dashboard + CLI**:

1. **Dashboard (one-time)**: Creación del proyecto, habilitación de Auth (Google + Email), habilitación de `pgvector`, obtención de credenciales. Es más visual y evita problemas de permisos de CLI en organizaciones.
2. **CLI (desarrollo continuo)**: `supabase init` para configuración local, `supabase link` para vincular al proyecto remoto, `supabase db diff` / migraciones para esquema futuro. El CLI es el estándar para flujos de migración y CI/CD.
3. **Variables de entorno**: Plantilla `.env.example` en la raíz del repo con todas las claves necesarias para frontend (`NEXT_PUBLIC_*`), backend (`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`) y OAuth Google. Secretos reales en `.env.local` (gitignored).
4. **Verificación**: Script Node/Python sencillo que valida conexión, Auth y extensión `pgvector` contra el proyecto remoto.

Este enfoque respeta los límites duros de `tech-stack.md`: no hardcodea URLs, separa claves por rol (anon vs service_role), y usa Supabase managed (Free Tier 500 MB). La misión de "privacidad por defecto" se cumple habilitando RLS desde el inicio (aunque las políticas vienen en feature 004).

## Implementación

### 1. Preparación y creación del proyecto (Dashboard)
- [ ] Acceder a [supabase.com/dashboard](https://supabase.com/dashboard) con cuenta personal/organización.
- [ ] **New Project** → Nombre: `bookshelf` (o según convención), Región cercana (ej. `eu-west-1`), Password de DB seguro (guardar en gestor de contraseñas).
- [ ] Plan: **Free Tier** (500 MB, 1 GB transfer, 50 MAU). Confirmar límites.
- [ ] Esperar aprovisionamiento (~2 min). Anotar **Project URL** y **Project Ref** (ej. `abcdefghijklmnop`).

### 2. Habilitar extensión `pgvector`
- [ ] En Dashboard → **SQL Editor** → New Query.
- [ ] Ejecutar: `CREATE EXTENSION IF NOT EXISTS vector;`
- [ ] Verificar: `SELECT * FROM pg_extension WHERE extname = 'vector';` → debe devolver fila con `extname = 'vector'`, `extversion >= '0.7'`.

### 3. Configurar Autenticación (Auth)
- [ ] Dashboard → **Authentication** → **Providers**.
- [ ] **Email/Password**: Toggle ON. Confirmar "Enable email confirmations" según preferencia (recomendado: ON para producción, OFF para dev local).
- [ ] **Google OAuth**:
  - [ ] En Google Cloud Console → APIs & Services → Credentials → Create OAuth 2.0 Client ID.
  - [ ] Authorized redirect URIs: `https://<PROJECT_REF>.supabase.co/auth/v1/callback` (URL exacta del proyecto).
  - [ ] Copiar **Client ID** y **Client Secret**.
  - [ ] En Supabase Dashboard → Google provider → pegar Client ID / Secret → Save.
  - [ ] Toggle ON Google provider.

### 4. Obtener credenciales del proyecto
- [ ] Dashboard → **Settings** → **API**.
- [ ] Copiar:
  - `Project URL` (ej. `https://abcdefghijklmnop.supabase.co`)
  - `anon public` key (clave pública, segura para frontend)
  - `service_role` secret key (**privada**, solo backend/MCP — **nunca en frontend**)
- [ ] Dashboard → **Settings** → **Auth** → **JWT Secret** (opcional, para verificación local de tokens sin llamada a Supabase). Copiar si se usará.

### 5. Crear `.env.example` en la raíz del repo
- [ ] Archivo: `bookshelf/.env.example`
- [ ] Contenido mínimo (plantilla, sin valores reales):
```env
# Supabase (proyecto remoto)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_JWT_SECRET=

# Google OAuth (para Auth Supabase + eventual uso directo)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Backend (FastAPI) - se añadirán en features posteriores
# GEMINI_API_KEY=
# OPEN_LIBRARY_RATE_LIMIT=
```
- [ ] Verificar que `.gitignore` incluye `.env*`, `.env.local`, `*.key`, `*.pem`.

### 6. Configuración local con Supabase CLI (para desarrollo y migraciones futuras)
- [ ] Instalar CLI: `npm i -g supabase` (o `brew install supabase/tap/supabase`).
- [ ] En raíz del repo (`bookshelf/`): `supabase init` → crea `supabase/config.toml`.
- [ ] Vincular proyecto: `supabase link --project-ref <PROJECT_REF>` (pide password de DB).
- [ ] Verificar link: `supabase status` (debe mostrar connected to remote).
- [ ] Pull esquema actual (opcional, para baseline): `supabase db pull` → genera migración inicial en `supabase/migrations/`.

### 7. Script de verificación (health check)
- [ ] Crear `scripts/verify-supabase.ts` (o `.py`) en la raíz:
  - Usa `@supabase/supabase-js` (Node) o `supabase-py` (Python).
  - Lee variables de `.env.local` (usuario debe copiar `.env.example` → `.env.local` y rellenar).
  - Tests:
    1. Conexión: `supabase.from('books').select('count').limit(1)` (espera error 404/RLS, no error de red).
    2. Auth: `supabase.auth.getSession()` (espera null, no error de config).
    3. pgvector: `supabase.rpc('version')` o SQL directo `SELECT extversion FROM pg_extension WHERE extname='vector';`.
  - Exit code 0 si todo OK, 1 si falla + mensaje descriptivo.
- [ ] Añadir a `package.json` (raíz o `apps/web`): `"verify:supabase": "tsx scripts/verify-supabase.ts"`.

### 8. Documentación onboarding (README / docs/)
- [ ] En `README.md` (o `docs/supabase-setup.md`):
  - Pasos para nuevo desarrollador: copiar `.env.example` → `.env.local`, rellenar claves.
  - `supabase link --project-ref <REF>` (una vez).
  - `npm run verify:supabase` para validar setup.
  - Nota: `service_role` key solo en backend/MCP; frontend usa `anon` key.

## Decisiones

| Decisión | Justificación | Alternativas descartadas |
|----------|---------------|--------------------------|
| **Dashboard para creación inicial + Auth + pgvector** | UI guiada, evita permisos CLI en orgs, visualización inmediata de credenciales. | `supabase projects create` (CLI): requiere PAT, menos intuitivo para OAuth Google. |
| **CLI para desarrollo local y migraciones** | Estándar de la industria, `supabase db diff`/`migration new` generan SQL versionado, integra con CI/CD. | Solo Dashboard + SQL manual: no versiona esquema, propenso a drift. |
| **`.env.example` en raíz (no por app)** | Variables compartidas entre `apps/web`, `apps/api`, `apps/mcp`. Un solo source of truth. | `.env.example` por app: duplicación, riesgo de desincronización. |
| **`service_role` key solo en backend/MCP** | Respeta límite duro `tech-stack.md` línea 141. RLS bypass solo en operaciones de sistema (vectorización, admin). | Usar `service_role` en frontend: rompe aislamiento RLS, riesgo seguridad. |
| **Google OAuth configurado en Supabase (no directo en apps)** | Centraliza Auth, maneja refresh tokens, PKCE, sesión unificada. Supabase emite JWT propio. | OAuth directo en Next.js/FastAPI: duplicar lógica, manejar refresh, más superficie de error. |
| **Script de verificación en TypeScript (Node)** | Consistente con frontend stack, `@supabase/supabase-js` es cliente oficial. | Python: requiere `supabase-py` extra, dos stacks de verificación. |

## Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| **Límites Free Tier (500 MB DB, 50 MAU)** | Media (proyecto crece) | Alto (bloquea desarrollo) | Monitorear uso en Dashboard; planear migración a Pro ($25/mes) antes de límite. Documentar en README. |
| **Google OAuth: redirect URI mismatch** | Alta (config manual) | Medio (Auth rota) | Verificar URI exacta: `https://<REF>.supabase.co/auth/v1/callback`. Probar en incógnito. Documentar pasos en setup. |
| **Rotación de `service_role` key** | Baja | Crítico (backend/MCP caen) | Guardar en gestor de secretos (1Password, Bitwarden). Proceso documentado: regenerar en Dashboard → actualizar `.env.local` + secrets CI/CD (Render/Vercel). |
| **pgvector version < 0.7 en Free Tier** | Baja | Alto (HNSW no disponible) | Verificar `extversion` tras `CREATE EXTENSION`. Si < 0.7, ticket a Soporte Supabase o upgrade plan. |
| **Drift entre schema local (CLI) y remoto** | Media | Medio (migraciones fallan) | `supabase db pull` tras cambios en Dashboard. CI: `supabase db diff --linked` en PR check. |
| **Credenciales commiteadas por error** | Baja | Crítico (fuga secrets) | `.gitignore` estricto (línea 142 tech-stack). Pre-commit hook: `git-secrets` o `ggshield`. Revisar en PR. |
| **Email confirmations ON en dev local** | Media | Bajo (fricción onboarding) | Permitir desactivar via `.env.local` (`SUPABASE_AUTH_EMAIL_CONFIRM=false`) o usar dashboard toggle por entorno. |

---

**Próximo paso**: Una vez aprobado este plan, el **descomponedor** generará `tasks.md` con checklist granular para el implementador.