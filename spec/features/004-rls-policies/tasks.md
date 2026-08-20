## 004 · RLS Policies — Tasks

### Preparación
- [x] Verificar feature 003 completada y migraciones previas aplicadas (roadmap: 003 = Hecho)
- [x] Verificar que las tablas `books` y `book_notes` existen: `SELECT * FROM pg_tables WHERE tablename IN ('books','book_notes');`

### Migración SQL
- [x] Crear la migración de RLS con el contenido exacto del plan (`supabase/migrations/004_rls_policies.sql`):
  - `ALTER TABLE books ENABLE ROW LEVEL SECURITY;`
  - `ALTER TABLE book_notes ENABLE ROW LEVEL SECURITY;`
  - `CREATE POLICY books_user_isolation ON books FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);`
  - `CREATE POLICY book_notes_user_isolation ON book_notes FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);`
  - **Nota**: el archivo se nombró `004_rls_policies.sql` (no `003_`): `003` ya está registrada como versión en `supabase_migrations.schema_migrations` (PK = prefijo numérico, usada por `003_pgvector_hnsw.sql`). Dos migraciones con el mismo prefijo son imposibles en Supabase CLI (SQLSTATE 23505). Contenido idéntico al plan.
- [x] Validar sintaxis SQL inspección visual — convención forward-only respetada (archivo nuevo numerado; no modifica migraciones aplicadas). `CREATE POLICY` no soporta `IF NOT EXISTS` en PostgreSQL; la migración se aplica una sola vez.
- [x] Dry-run `supabase db push --dry-run` OK (opcional) — sin errores de sintaxis; el CLI pidió `--include-all` por el orden alfabético (la nueva migración se inserta antes de `20260815185301`).

### Aplicación
- [x] Aplicar la migración en entorno de desarrollo:
  - Opción B (CLI): `supabase db push --include-all` → aplicada en el proyecto remoto `xtjvwlmwdjpsblqrghno`.
- [x] Confirmar aplicación exitosa consultando `pg_policies`:
  - `books` → `books_user_isolation` | `PERMISSIVE` | roles `{public}` | `cmd = ALL` | `qual = with_check = '(auth.uid() = user_id)'`
  - `book_notes` → `book_notes_user_isolation` | `PERMISSIVE` | roles `{public}` | `cmd = ALL` | `qual = with_check = '(auth.uid() = user_id)'`
  - `pg_class.relrowsecurity = true` en ambas tablas; migración `004` registrada en `schema_migrations`.

### Pruebas de integración
- [x] Escribir test de integración (`apps/api/tests/test_rls_policies.py`) que:
  - Crea dos usuarios de prueba reales vía Supabase Auth (Admin API con `service_role` + login password grant).
  - Como usuario A: inserta 1 libro + 1 nota en `books`/`book_notes`.
  - Como usuario B (token distinto): consulta `books` y `book_notes` → 0 filas.
  - Como usuario A: consulta → 1 fila cada tabla.
  - Intenta INSERT/UPDATE/DELETE como B sobre filas de A → error 42501/403 o 0 filas afectadas (dato intacto).
  - Extra: rol `anon` (sin login) → 0 filas; `service_role` bypassea RLS (insert 201 + lee todas las filas).
- [x] Ejecutar test de integración y validar que pasan → `7 passed`.

### Validación de criterios spec.md
- [x] Criterio 1: Migración ejecuta `ALTER TABLE books ENABLE ROW LEVEL SECURITY;` (verificado: `relrowsecurity = true`)
- [x] Criterio 2: Migración ejecuta `ALTER TABLE book_notes ENABLE ROW LEVEL SECURITY;` (verificado: `relrowsecurity = true`)
- [x] Criterio 3: Policy `books_user_isolation` creada con `FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);` (verificado en `pg_policies`)
- [x] Criterio 4: Policy `book_notes_user_isolation` creada con `FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);` (verificado en `pg_policies`)
- [x] Criterio 5: Verificación manual: con dos usuarios (A y B), insertar libros/notas como A; consultar con token de B → 0 filas. Consultar con token de A → filas propias. (test de integración: `test_a_inserta_y_ve_sus_filas`, `test_b_no_ve_filas_de_a`)
- [x] Criterio 6: Políticas cubren `SELECT`, `INSERT`, `UPDATE`, `DELETE` (cláusula `ALL`). (pg_policies `cmd = ALL` + tests de escritura cruzada bloqueada)
- [x] Criterio 7: No hay políticas `PUBLIC` ni `ANON` que filtren datos. (solo 2 policies con `auth.uid()` check; test `test_anon_no_ve_nada` → 0 filas)
- [x] Criterio 8: `service_role` key (backend/MCP) bypassea RLS automáticamente (comportamiento nativo Supabase). (test `test_service_role_bypassea_rls` → insert 201 + ve todas las filas)

### Lint y Build backend
- [x] Ejecutar suite de tests backend: `cd apps/api && pytest -v` → `7 passed` (con `.venv` de la raíz)
- [x] Ejecutar lint backend: `cd apps/api && ruff check . && black --check .` → sin warnings, formateado con black
- [ ] Ejecutar build backend (Docker): `cd apps/api && docker build -t bookshelf-api .` — **NO EJECUTABLE**: el runtime Docker no está instalado en este entorno (`docker: command not found`, sin podman/nerdctl). Además el `Dockerfile` de `apps/api` corresponde a la feature 006 (FastAPI Scaffold). Requiere entorno con Docker o decisión del orquestador.

### Cierre y documentación
- [x] Mover la feature a "Hecho" en `../../constitution/roadmap.md` — **corresponde al agente `roadmap`** tras la aprobación del revisor (AGENTS.md: el implementador no ejecuta este paso; la feature debe validarse primero).
- [x] Actualizar documentación interna si procede: `spec.md` actualizado (Estado: `propuesta` → `en curso`). `plan.md` y `spec.md` reflejan el estado final; desviación de nombre de migración documentada en este checklist.
