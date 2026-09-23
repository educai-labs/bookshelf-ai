# 024 · Schema Migration Verification

**Estado:** hecho

## Qué hace

Convierte el **drift de migraciones** (esquema esperado en el repo ≠ esquema real del remoto Supabase) en fallos **detectables y accionables**, en lugar de 500 genéricos descubiertos por los usuarios. Tres piezas:

**1. Verificador de esquema contra el remoto — `npm run verify:schema`**

Nuevo script `scripts/verify-schema.py` con wrapper npm `verify:schema` en `package.json` (mismo patrón que `verify:supabase:py`). Se conecta al proyecto Supabase **remoto** usando `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` del entorno (carga `.env.local` si existe, mismo loader que `verify-supabase.py`) y comprueba la existencia de:

- **Tablas:** `books`, `book_notes`, `account_preferences`.
- **RPC:** `match_book_notes`.
- **Extensión:** `vector` (pgvector) e **índices HNSW** sobre `book_notes.embedding` (`idx_book_notes_embedding_hnsw`, migración 003).

Salida legible: un ✓/✗ por objeto; si falta algo, lista los faltantes con su tipo (tabla / RPC / extensión / índice) y el remedio (`supabase db push --include-all` + re-ejecutar `npm run verify:schema`). **Exit 0** si todo existe; **exit 1** si falta cualquier objeto. Nunca imprime la service_role key ni otros secretos, ni la URL completa del proyecto.

**2. Errores accionables en backend — HTTP 503 `DB_MIGRATION_MISSING`**

`map_supabase_error` (`apps/api/app/core/errors.py`) mapea los códigos PostgREST de esquema ausente:

- `PGRST205` (tabla/columna ausente) → **503** `{code: "DB_MIGRATION_MISSING", message: "<qué falta y cómo arreglarlo>"}`.
- `PGRST202` (función ausente) → **503** `{code: "DB_MIGRATION_MISSING", ...}` con el mismo remedio.

Al vivir en el mapeador común, aplica a **settings, notes, books y chat/RAG** sin cambios en los endpoints. Los errores ya existentes no varían: `23505` → 409 `isbn_duplicate`; `23503`/`PGRST116`/`406` → 404 `BOOK_NOT_FOUND`; resto → 500 `DB_ERROR`.

**3. Prevención de proceso + documentación**

- Test unitario del mapeo en la suite backend con `APIError` simulada (PGRST205/PGRST202 → 503; regresión de los mapeos existentes).
- Convención SDD: toda feature futura que cree una migración incluye en su `tasks.md` la tarea obligatoria "aplicar al remoto (`supabase db push --include-all`) + `npm run verify:schema`" con evidencia. Documentada en `AGENTS.md` y `docs/supabase-setup.md`.
- `docs/supabase-setup.md` documenta el comando: variables requeridas, salida esperada, exit codes y cómo interpretar cada fallo.

## Por qué

Evidencia real (2026-09-22): `supabase migration list` mostraba `005_rpc_match_book_notes.sql` y `006_account_preferences.sql` **pendientes** en el remoto pese a estar `[x]` en sus tasks.md y con sus features en `hecho`. Impacto: `GET /api/v1/settings` devolvía 500 (`PGRST205`, tabla `account_preferences` ausente) y el modo RAG del chat (017) estaba roto (`PGRST202`, función `match_book_notes` ausente).

El drift nunca se detecta antes de desplegar: los tests backend usan un Supabase en memoria (el esquema local siempre "parece" correcto) y `scripts/verify-supabase.py`/`.ts` (feature 001) solo comprueban la tabla `books` — no cubren RPC, extensiones ni el resto del esquema. Esta feature cierra el hueco por ambos lados: (a) un comando ejecutable en cualquier momento que valida el esquema remoto completo contra lo esperado (local o desde CI; 020 lo invocará), y (b) si aun así llega drift a producción, el cliente recibe un 503 con causa y remedio explícitos en lugar de un 500 indistinguible de cualquier otro bug. Refuerza el principio de misión "especificación antes que código": lo que las specs/tasks declaran aplicado debe ser **verificable**.

## Criterios de aceptación

**Script de verificación (`scripts/verify-schema.py` + wrapper npm):**

- [ ] `package.json` expone `verify:schema`, que ejecuta `scripts/verify-schema.py` (patrón `verify:supabase:py`).
- [ ] Con todos los objetos presentes en el remoto: exit 0 con salida que lo confirma objeto a objeto.
- [ ] Si falta cualquier objeto: exit 1, listando los faltantes con tipo y nombre (tabla / RPC / extensión / índice) e indicando el remedio.
- [ ] Comprueba exactamente: tablas `books`, `book_notes`, `account_preferences`; RPC `match_book_notes`; extensión `vector`; índice HNSW `idx_book_notes_embedding_hnsw` sobre `book_notes.embedding`.
- [ ] Credenciales solo desde variables de entorno (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`; carga `.env.local` si existe, patrón de `verify-supabase.py`).
- [ ] Si faltan variables de entorno: mensaje que indica qué variables faltan y dónde definirlas, exit ≠ 0, sin intentar la conexión.
- [ ] Nunca imprime secretos (service_role key, etc.) ni la URL completa del proyecto.
- [ ] Un error de red o de credenciales se reporta como fallo de verificación (exit 1), distinguible de "objeto ausente".

**Mapeo de errores backend (`apps/api/app/core/errors.py`):**

- [ ] `PGRST205` → HTTP 503 con `detail = {code: "DB_MIGRATION_MISSING", message: ...}`; el mensaje identifica qué falta y el remedio (aplicar migraciones pendientes: `supabase db push --include-all` y verificar con `npm run verify:schema`).
- [ ] `PGRST202` → HTTP 503 con el mismo `code` y remedio (función ausente).
- [ ] El mapeo vive en `map_supabase_error` (camino común), por lo que cubre settings, notes, books y chat/RAG sin modificar los endpoints.
- [ ] Los mapeos existentes NO cambian de comportamiento: `23505` → 409 `isbn_duplicate` (field `isbn13`); `23503`/`PGRST116`/`406` → 404 `BOOK_NOT_FOUND`; resto → 500 `DB_ERROR`.
- [ ] El `detail` mantiene el formato de convención `tech-stack.md`: `{ code, message, field? }`.
- [ ] El código PostgREST original queda registrado en el log del servidor (sin secretos) para diagnóstico.

**Tests (suite backend):**

- [ ] Test unitario del mapeo con `APIError` simulada: `PGRST205` y `PGRST202` → 503 + `code: "DB_MIGRATION_MISSING"` + mensaje accionable (asserts sobre `status_code` y `detail`).
- [ ] Tests de regresión: los códigos ya mapeados (`23505`, `23503`, `PGRST116`, `406`, código desconocido) producen exactamente el mismo resultado que antes de la feature.
- [ ] `pytest -v`, `ruff check .` y `black --check .` en verde en `apps/api` tras la feature.

**Proceso y documentación:**

- [ ] `docs/supabase-setup.md` documenta: comando, variables requeridas, salida esperada, exit codes (0/1) y cómo interpretar cada fallo (incluido el caso de drift detectado).
- [ ] `AGENTS.md` recoge la convención obligatoria: toda feature que cree una migración incluye en su `tasks.md` la tarea "aplicar al remoto (`supabase db push --include-all`) + `npm run verify:schema`" con evidencia del resultado.

## Fuera de alcance

- **CI/CD completo** (ejecutar el verificador en pipeline, gate de deploy) → feature **020**; aquí solo se entrega el script + hook npm, diseñado para que 020 lo invoque.
- **Drift fino por columna** (tipos, constraints, DDL byte a byte): se valida existencia de objetos y columnas clave, no el DDL exacto.
- **Modificar migraciones ya aplicadas** — prohibido por `tech-stack.md` (límite duro); ante drift, el remedio es aplicar migraciones pendientes o crear una nueva numerada.
- **Entornos locales** (`supabase db reset`, verificación del esquema local): el script verifica solo el remoto.
- **Refactor o sustitución de `scripts/verify-supabase.py`/`.ts`** (feature 001): se mantienen intactos; `verify-schema.py` es un script nuevo e independiente.
- **Auto-reparación** (aplicar migraciones automáticamente desde el script o el backend): el remedio es siempre manual y explícito.
- **Panel/UI de estado de migraciones** en el frontend: no hay panel de admin (misión: no es multi-tenant SaaS); los consumidores del 503 reciben el mensaje accionable, nada más.
