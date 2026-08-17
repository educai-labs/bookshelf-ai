# 004 · RLS Policies — Plan de implementación

## Enfoque técnico

Crear una migración SQL numerada (`003_rls_policies.sql`) en `supabase/migrations/` que habilite RLS en las tablas `books` y `book_notes` y defina políticas `ALL` usando `auth.uid() = user_id`. La migración se aplica directamente en Supabase (Dashboard o CLI) y se verifica con tests de integración que simulan dos usuarios distintos. Esta aproximación respeta el stack (PostgreSQL/Supabase), la convención de migraciones numeradas y el límite duro de no modificar migraciones ya aplicadas.

## Implementación

**Pasos concretos (orden de ejecución):**

1. **Crear archivo de migración** `supabase/migrations/003_rls_policies.sql` con el siguiente contenido exacto:
   ```sql
   -- Habilita RLS en tabla books
   ALTER TABLE books ENABLE ROW LEVEL SECURITY;

   -- Habilita RLS en tabla book_notes
   ALTER TABLE book_notes ENABLE ROW LEVEL SECURITY;

   -- Política de aislamiento por usuario en books (cubre SELECT, INSERT, UPDATE, DELETE)
   CREATE POLICY books_user_isolation ON books
     FOR ALL
     USING (auth.uid() = user_id)
     WITH CHECK (auth.uid() = user_id);

   -- Política de aislamiento por usuario en book_notes (cubre SELECT, INSERT, UPDATE, DELETE)
   CREATE POLICY book_notes_user_isolation ON book_notes
     FOR ALL
     USING (auth.uid() = user_id)
     WITH CHECK (auth.uid() = user_id);
   ```

2. **Aplicar la migración** en entorno de desarrollo (Supabase local o remoto):
   - Opción A (Dashboard): Copiar/pegar el SQL en Supabase Dashboard → SQL Editor → Run.
   - Opción B (CLI): `supabase db push` (si usa Supabase CLI local).

3. **Verificar aplicación exitosa** consultando `pg_policies`:
   ```sql
   SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
   FROM pg_policies
   WHERE tablename IN ('books', 'book_notes');
   ```
   Deben aparecer 2 filas (una por tabla) con `cmd = 'ALL'` y `qual = with_check = 'auth.uid() = user_id'`.

4. **Escribir test de integración** (backend, `apps/api/tests/test_rls_policies.py`) que:
   - Crea dos usuarios de prueba vía Supabase Auth (signup/login programático o usa `service_role` para crear users + tokens).
   - Como usuario A: inserta 1 libro + 1 nota en `books`/`book_notes`.
   - Como usuario B (token distinto): consulta `books` y `book_notes` → 0 filas.
   - Como usuario A: consulta → 1 fila cada tabla.
   - Intenta INSERT/UPDATE/DELETE como B sobre filas de A → error 42501 (insufficient_privilege) o 0 filas afectadas.

5. **Ejecutar suite de tests** y validar que pasan.

6. **Ejecutar lint y build** del backend para asegurar que no hay regresiones.

## Decisiones clave

| Decisión | Justificación | Alternativas descartadas |
|----------|---------------|--------------------------|
| Usar `FOR ALL` en lugar de políticas separadas por acción | Los datos son 100% privados por usuario; no hay acciones públicas ni de lectura compartida. `ALL` es más simple, auditable y cubre INSERT/UPDATE/DELETE/SELECT de golpe. | Políticas granulares (`FOR SELECT`, `FOR INSERT`, etc.) — añaden complejidad sin beneficio para este dominio. |
| `USING` + `WITH CHECK` idénticos (`auth.uid() = user_id`) | Garantiza consistencia: lo que puedes leer es exactamente lo que puedes escribir. `WITH CHECK` valida INSERT/UPDATE; `USING` valida SELECT/DELETE. | Solo `USING` — permitiría INSERT de filas que luego no podrías leer (inconsistencia). |
| Migración numerada `003_` (tras `001_init`, `002_rls`) | Convención del proyecto: migraciones secuenciales, inmutables tras aplicar. Ver `tech-stack.md` "Límites duros". | Modificar migración anterior — prohibido por constitución. |
| Verificación con test de integración real (dos usuarios) | RLS se evalúa a nivel de engine; mocks no detectan errores de política. Test real valida comportamiento productivo. | Solo test unitario de SQL / inspección visual — insuficiente para garantía de aislamiento. |
| `service_role` key bypassea RLS automáticamente | Comportamiento nativo Supabase; backend/MCP usan `service_role` para operaciones de sistema (vectorización, admin). No requiere configuración extra. | Crear política `BYPASSRLS` explícita — innecesario y riesgo de seguridad si se filtra. |

## Riesgos y mitigaciones

| Riesgo | Impacto | Probabilidad | Mitigación |
|--------|---------|--------------|------------|
| Migración falla porque tablas no existen (orden incorrecto) | Bloquea feature, requiere rollback manual | Baja (migraciones previas 001/002 crean tablas) | Verificar que `001_init.sql` y `002_rls.sql` (si existe) se aplicaron antes. Ejecutar `SELECT * FROM pg_tables WHERE tablename IN ('books','book_notes');` previo. |
| `auth.uid()` retorna `NULL` en contexto de test (sin JWT válido) | Tests falsos negativos (0 filas siempre) | Media | En tests, autenticar usuarios reales vía Supabase Auth (signup/login) y usar sus `access_token` en cliente Supabase; NO usar `service_role` para queries de prueba. |
| Política `ALL` bloquea operaciones legítimas del backend (ej. vectorización que inserta chunks en `book_notes`) | Rompe features dependientes (embeddings, chat) | Baja (backend usa `service_role` que bypassea RLS) | Confirmar que backend/MCP usan `service_role` key (ver `tech-stack.md` convención "Autenticación"). Test de integración incluye insert con `service_role` → debe pasar. |
| Fuga de datos si se añade política `PUBLIC`/`ANON` por error | Crítico (seguridad) | Muy baja (revisión de código + test verifica 0 filas cross-user) | Test de aceptación explícito: "No hay políticas PUBLIC/ANON". Revisor valida migración SQL antes de merge. |
| Cambio futuro de modelo (nueva tabla con `user_id`) sin RLS | Debt técnico, fuga silenciosa | Media | Documentar en `tech-stack.md` convención: "Toda tabla con `user_id` FK → RLS obligatorio". PR template incluye checklist RLS. |

## Comandos de validación

Ejecutar en orden tras implementar:

```bash
# 1. Tests backend (incluye test_rls_policies.py)
cd apps/api && pytest -v

# 2. Lint backend
cd apps/api && ruff check . && black --check .

# 3. Build backend (Docker)
cd apps/api && docker build -t bookshelf-api .

# 4. (Opcional) Test frontend si hay cambios en cliente Supabase
cd apps/web && npm run test

# 5. (Opcional) Lint frontend
cd apps/web && npm run lint

# 6. (Opcional) Build frontend
cd apps/web && npm run build
```

**Criterios de éxito**: Todos los comandos arriba pasan sin errores. Test `test_rls_policies.py` verifica explícitamente los 5 criterios de aceptación de `spec.md`.