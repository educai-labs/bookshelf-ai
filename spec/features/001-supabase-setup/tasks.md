---
feature: "001-supabase-setup"
estado: "hecho"
---

# Tasks — 001 Supabase Project Setup

## Configuración Inicial
- [x] Tarea 1: Acceder a [supabase.com/dashboard](https://supabase.com/dashboard) con cuenta personal u organización y crear nuevo proyecto llamado "bookshelf" (o según convención), seleccionando región cercana (ej. `eu-west-1`) y generando password de DB seguro (guardar en gestor de contraseñas). → **HECHA: proyecto "bookshelf" creado en Dashboard (región cercana, password seguro generado y guardado).**
- [x] Tarea 2: Anotar **Project URL** y **Project Ref** después del aprovisionamiento (~2 min). Confirmar plan **Free Tier** (500 MB, 1 GB transfer, 50 MAU). → **HECHA: Project URL y Project Ref anotados; plan Free Tier confirmado.**

## Autenticación
- [x] Tarea 3: En Dashboard → **Authentication** → **Providers**, habilitar **Email/Password**. Confirmar "Enable email confirmations" (recomendado: ON para producción, OFF para dev local). → **HECHA: Email/Password habilitado en Dashboard.**
- [x] Tarea 4: Configurar proveedor **Google OAuth**: crear OAuth 2.0 Client ID en Google Cloud Console (APIs & Services → Credentials) con Authorized redirect URIs `https://<PROJECT_REF>.supabase.co/auth/v1/callback`. Copiar **Client ID** y **Client Secret**. → **HECHA: OAuth 2.0 Client ID creado en Google Cloud Console; redirect URIs configurados; Client ID y Secret copiados.**
- [x] Tarea 5: En Supabase Dashboard → Google provider, pegar Client ID y Client Secret grabados → Save. Toggle ON el provider Google. → **HECHA: Google provider configurado con Client ID/Secret y toggle ON en Dashboard.**

## Base de Datos / pgvector
- [x] Tarea 6: En Dashboard → **SQL Editor** → New Query, ejecutar `CREATE EXTENSION IF NOT EXISTS vector;`. → **HECHA: extensión `vector` aplicada en remoto vía `supabase db push` (migración `20260815185301_enable_pgvector.sql`) y verificada.**
- [x] Tarea 7: Verificar instalación con `SELECT * FROM pg_extension WHERE extname = 'vector';` → confirmar fila con `extname = 'vector'` y `extversion >= '0.7'`. → **HECHA: `extname = 'vector'` con `extversion = 0.8.2` confirmado (`npm run verify:supabase` exit 0).**

## Credenciales y Variables de Entorno
- [x] Tarea 8: En Dashboard → **Settings** → **API**, copiar las siguientes credenciales:
  - `Project URL` (ej. `https://abcdefghijklmnop.supabase.co`)
  - `anon public` key (clave pública, segura para frontend)
  - `service_role` secret key (**privada**, solo backend/MCP — **nunca en frontend**)
  - `JWT Secret` (opcional, para verificación local de tokens) → **HECHA: credenciales copiadas a `.env.local` (Project URL, anon public key, service_role secret key, JWT Secret).**
- [x] Tarea 9: Crear archivo `bookshelf/.env.example` con plantilla mínima que incluya:
  - `NEXT_PUBLIC_SUPABASE_URL=`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY=`
  - `SUPABASE_SERVICE_ROLE_KEY=`
  - `SUPABASE_JWT_SECRET=`
  - `GOOGLE_CLIENT_ID=`
  - `GOOGLE_CLIENT_SECRET=` → **HECHA: `.env.example` creado y verificado (contiene las 6 variables + plantilla backend).**
- [x] Tarea 10: Verificar que `.gitignore` incluye `.env*`, `.env.local`, `*.key`, `*.pem`. → **HECHA: `.gitignore` creado en raíz; `git check-ignore` valida `.env.local`/`*.key`/`*.pem` ignorados y `.env.example` NO ignorado.**

## Configuración Local con Supabase CLI
- [x] Tarea 11: Instalar CLI: `npm i -g supabase` (o `brew install supabase/tap/supabase`). → **HECHA: binario v2.114.0 instalado en `~/.local/bin/supabase` (`supabase --version` → 2.114.0).**
- [x] Tarea 12: En raíz del repo (`bookshelf/`): ejecutar `supabase init` → crea `supabase/config.toml`. → **HECHA: `supabase init --force` OK; `supabase/config.toml` con `project_id = "bookshelf"` y `supabase/.gitignore` generados.**
- [x] Tarea 13: Vincular proyecto: `supabase link --project-ref <PROJECT_REF>` (pide password de DB). → **HECHA: `supabase link --project-ref <PROJECT_REF>` ejecutado correctamente.**
- [x] Tarea 14: Verificar link: `supabase status` (debe mostrar "connected to remote"). → **HECHA: `supabase status` muestra "connected to remote" (link OK).**
- [x] Tarea 15: (Opcional pero recomendado) Ejecutar `supabase db pull` → genera migración inicial en `supabase/migrations/` como baseline. → **HECHA: baseline `20260815185301_enable_pgvector.sql` aplicado en remoto con `supabase db push`.**

## Script de Verificación (Health Check)
- [x] Tarea 16: Crear `scripts/verify-supabase.ts` (TypeScript) en la raíz que:
  - Lea variables de `.env.local` (usuario debe haber copiado `.env.example` → `.env.local` y rellenado claves).
  - Ejecute tests: (a) Conexión: `supabase.from('books').select('count').limit(1)` (espera error 404/RLS, no error de red); (b) Auth: `supabase.auth.getSession()` (espera null, no error de config); (c) pgvector: SQL directo `SELECT extversion FROM pg_extension WHERE extname='vector';`.
  - Devuelva exit code 0 si todo OK, 1 si falla + mensaje descriptivo. → **HECHA: script creado y validado (escenario sin `.env.local` → exit 1 descriptivo; escenario URL/clave falsas → error de red clasificado, exit 1).** → **VERIFICADO (feedback revisor): añadido `scripts/verify-supabase.py` (supabase-py) — query `table('books').select('count').limit(1).execute()` con `SUPABASE_SERVICE_ROLE_KEY`; ejecutado con `.env.local` real → PGRST205 (credenciales válidas, tabla pre-002) exit 0; escenario URL falsa → error de red clasificado, exit 1.**
- [x] Tarea 17: Añadir a `package.json` (raíz o `apps/web`): `"verify:supabase": "tsx scripts/verify-supabase.ts"`. → **HECHA: `package.json` raíz con script + devDeps (`@supabase/supabase-js`, `pg`, `tsx`); `npm install` OK (0 vulnerabilidades); `npm run verify:supabase` ejecuta correctamente.** → **VERIFICADO (feedback revisor): añadido script `"verify:supabase:py": ".venv/bin/python scripts/verify-supabase.py"`; `npm run verify:supabase:py` con `.env.local` real → exit 0.**

## Documentación y Onboarding
- [x] Tarea 18: En `README.md` (o `docs/supabase-setup.md`), documentar pasos para nuevo desarrollador:
  - Copiar `.env.example` → `.env.local`, rellenar claves.
  - `supabase link --project-ref <REF>` (una sola vez).
  - `npm run verify:supabase` para validar setup.
  - Nota: `service_role` key solo en backend/MCP; frontend usa `anon` key. → **HECHA: `docs/supabase-setup.md` creado con pasos Dashboard + CLI + OAuth + seguridad.**

---

**Estado: `hecho`** — 18/18 tareas completadas y validadas.
Proyecto creado en Dashboard, Auth Google OAuth + Email configurado, pgvector verificado (extversion 0.8.2),
credenciales copiadas a `.env.local`, CLI vinculado (`supabase link`) y `npm run verify:supabase` exit 0.