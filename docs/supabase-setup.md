# Supabase Setup (Feature 001)

Este documento explica cómo configurar el proyecto Supabase que usa Bookshelf como backend:
PostgreSQL + pgvector, Auth (Google OAuth + Email/Password) y almacenamiento de credenciales.

> **Actualizado (Feature 002):** al final se documenta cómo reproducir la migración 002
> (`books` + `book_notes`) en un proyecto nuevo. Ver [Reproducir la migración 002](#reproducir-la-migración-002).

## Arquitectura de credenciales

| Variable | Rol | Dónde se usa |
|----------|-----|--------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Pública | Frontend Next.js, backend FastAPI |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Pública (segura en frontend) | Cliente Supabase del navegador (respeta RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Privada** — SOLO backend/MCP | Operaciones de sistema (vectorización, admin). **Nunca en frontend.** |
| `SUPABASE_JWT_SECRET` | Privada (opcional) | Verificación local de tokens sin llamada a Supabase |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Privadas | Proveedor Google OAuth en Supabase Auth |
| `SUPABASE_DB_URL` | Privada (opcional) | Verificación SQL directa de pgvector en `verify-supabase.ts` |

## 1. Crear el proyecto Supabase (una vez, Dashboard)

1. Entra en [supabase.com/dashboard](https://supabase.com/dashboard) con tu cuenta u organización.
2. **New Project**:
   - Nombre: `bookshelf`
   - Región cercana (ej. `eu-west-1`)
   - Password de DB seguro → guárdalo en tu gestor de contraseñas (lo pide `supabase link`).
   - Plan: **Free Tier** (500 MB DB, 1 GB transfer, 50 MAU).
3. Espera el aprovisionamiento (~2 min). Anota:
   - **Project URL**: `https://<PROJECT_REF>.supabase.co`
   - **Project Ref**: `<PROJECT_REF>` (ej. `abcdefghijklmnop`)

## 2. Habilitar `pgvector`

Ya existe la migración lista en `supabase/migrations/20260815185301_enable_pgvector.sql`
(contenido: `CREATE EXTENSION IF NOT EXISTS vector;`).

Dos opciones equivalentes:

- **CLI (recomendado)**: tras `supabase link` (paso 5), ejecutar `supabase db push`.
- **Dashboard**: SQL Editor → New Query → `CREATE EXTENSION IF NOT EXISTS vector;` → Run.

**Verificación** (Dashboard → SQL Editor):

```sql
SELECT * FROM pg_extension WHERE extname = 'vector';
```

Debe devolver una fila con `extname = 'vector'` y `extversion >= '0.7'` (requisito para HNSW).

## 3. Configurar Autenticación

### Email/Password
Dashboard → **Authentication** → **Providers** → **Email** → Toggle ON.
"Enable email confirmations": recomendado **ON** en producción, **OFF** en dev local.

### Google OAuth (requiere Google Cloud Console + Supabase Dashboard)

1. **Google Cloud Console** → [console.cloud.google.com](https://console.cloud.google.com):
   - **APIs & Services → Credentials → Create Credentials → OAuth Client ID** (tipo *Web application*).
   - **Authorized redirect URIs** — añade la URL exacta de tu proyecto:
     ```
     https://<PROJECT_REF>.supabase.co/auth/v1/callback
     ```
   - Copia el **Client ID** y el **Client Secret**.
2. **Supabase Dashboard** → **Authentication → Providers → Google**:
   - Pega **Client ID** y **Client Secret** → **Save**.
   - Toggle **ON** el proveedor Google.
3. Prueba el login en incógnito (evita caché de sesiones previas).

> ⚠️ Error típico: *redirect_uri_mismatch*. Verifica que la URI en Google Cloud sea EXACTAMENTE
> `https://<PROJECT_REF>.supabase.co/auth/v1/callback` (con tu ref real).

## 4. Obtener credenciales (Dashboard → Settings → API)

- **Project URL**: `https://<PROJECT_REF>.supabase.co`
- **anon public**: clave pública (segura para el frontend)
- **service_role**: clave **secreta** — solo backend/MCP. Si se filtra, regenérala en Dashboard.
- (Opcional) **Settings → Auth → JWT Secret** para verificación local de tokens.

## 5. Configuración local (una vez por desarrollador)

```bash
# 1. Copiar plantilla y rellenar con las credenciales reales
cp .env.example .env.local
#    → editar .env.local con Project URL, anon key, service_role, Google creds

# 2. Instalar dependencias del repo (necesarias para el script de verificación)
npm install

# 3. Vincular Supabase CLI al proyecto remoto (pide el password de DB)
supabase link --project-ref <PROJECT_REF>

# 4. Aplicar migraciones (pgvector, esquema futuro…)
supabase db push

# 5. Validar el setup completo
npm run verify:supabase
```

`verify:supabase` comprueba: (a) conexión a la API, (b) endpoint de Auth + `getSession`,
(c) extensión `pgvector` (requiere `SUPABASE_DB_URL` en `.env.local`; si no está, lo omite con aviso).

Exit code `0` = todo OK · `1` = fallo con mensaje descriptivo.

## Reglas de seguridad

- **Nunca** uses `service_role` en el frontend: rompe RLS. Solo backend/MCP (operaciones de sistema).
- **Nunca** subas `.env.local`, `*.key` o `*.pem` al repo (`.gitignore` ya los excluye).
- Guarda `service_role`, `JWT Secret` y password de DB en tu gestor de contraseñas.
- Monitorea el uso de Free Tier (500 MB / 50 MAU) en Dashboard; planifica Pro antes de los límites.

---

## Reproducir la migración 002 (Feature 002)

La migración `supabase/migrations/002_books_notes.sql` crea el esquema base de Bookshelf:
enum `book_status`, tablas `books` y `book_notes` (con embedding `vector(768)`), trigger
`set_updated_at` e índices de apoyo. Es **forward-only** (Supabase ejecuta cada archivo de
`supabase/migrations/` de arriba a abajo; el bloque `DOWN` se documenta como comentario para
reversión manual, no se ejecuta automáticamente).

### Pasos

1. **Asegurar pgvector habilitado** (requisito de `book_notes.embedding vector(768)`):
   la migración 002 incluye `CREATE EXTENSION IF NOT EXISTS vector;` al inicio, por lo que
   se auto-satisface. Verificar igualmente:

   ```sql
   SELECT * FROM pg_extension WHERE extname = 'vector';
   ```

   Debe devolver una fila con `extversion >= '0.7'`.

2. **Aplicar la migración** — dos opciones equivalentes:

   - **CLI contra proyecto linkado** (recomendado): el proyecto ya está linkado
     (`supabase link --project-ref <PROJECT_REF>` hecho en Feature 001). Aplicar solo las
     migraciones pendientes:

     ```bash
     supabase db push --password "<DB_PASSWORD>"
     ```

     > Si la CLI avisa de migraciones locales que ordenan antes que la última remota
     > (nombres tipo `002_*` frente a `YYYYMMDDHHMMSS_*`), usar `--include-all`; la
     > migración 002 es idempotente respecto a pgvector y no depende de 001.

   - **Reset local con Docker** (desarrollo local): desde la raíz del repo,

     ```bash
     supabase db reset
     ```

     aplica todas las migraciones (`001` pgvector + `002` books/notes) sobre una DB local limpia.

3. **Verificar que el esquema está activo** (Dashboard → SQL Editor o `psql`):

   ```sql
   -- Tablas
   SELECT to_regclass('public.books'), to_regclass('public.book_notes');

   -- Enum con exactamente 3 valores
   SELECT enumlabel FROM pg_enum e
   JOIN pg_type t ON e.enumtypid = t.oid
   WHERE t.typname = 'book_status' ORDER BY e.enumsortorder;

   -- Trigger updated_at sobre books
   SELECT tgname, pg_get_triggerdef(oid) FROM pg_trigger
   WHERE NOT tgisinternal AND tgrelid = 'public.books'::regclass;

   -- Índices de apoyo
   SELECT indexname FROM pg_indexes
   WHERE schemaname = 'public'
     AND indexname IN ('idx_books_user_id', 'idx_book_notes_user_id', 'idx_book_notes_book_id');
   ```

4. **Validación funcional rápida** (constraints en acción):

   ```sql
   -- CHECK isbn13 (13 dígitos) debe rechazar:
   INSERT INTO books (user_id, isbn13, title) VALUES (gen_random_uuid(), '123', 'x'); -- error

   -- CHECK rating 1-5 debe rechazar:
   INSERT INTO books (user_id, title, rating) VALUES (gen_random_uuid(), 'x', 9); -- error

   -- NOT NULL title debe rechazar:
   INSERT INTO books (user_id) VALUES (gen_random_uuid()); -- error

   -- Dimensión vector debe ser 768:
   INSERT INTO book_notes (user_id, book_id, content, content_html, chunk_index, embedding)
   VALUES (gen_random_uuid(), gen_random_uuid(), 'x', '<p>x</p>', 0, '[0.1,0.2]'::vector); -- error
   ```

   > Las inserciones de prueba requieren `user_id`/`book_id` existentes en `auth.users`/`books`
   > (FKs). Los `gen_random_uuid()` de ejemplo fallarán primero por FK si no existen, que es
   > también el comportamiento esperado. Para probar constraints de formato usa IDs reales.

5. **Confirmar que la suite de validación del proyecto sigue pasando:**

   ```bash
   npm run verify:supabase
   npm run verify:supabase:py
   ```

   Ambas deben terminar con `RESULTADO: TODO OK ✅ (exit 0)` y reportar la tabla `books`
   accesible (ya no PGRST205).