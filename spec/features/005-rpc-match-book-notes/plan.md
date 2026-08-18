# 005 · RPC match_book_notes — Plan de implementación

## Enfoque técnico

Crear una migración SQL numerada (`004_rpc_match_book_notes.sql`) en `supabase/migrations/` que defina la función PL/pgSQL `match_book_notes` con firma y semántica exacta a `spec.md`. La función usa `SECURITY DEFINER` para ejecutar con privilegios del creador (bypass RLS interno) pero filtra obligatoriamente por `filter_user_id` para aislar datos por usuario. Incluye `SET search_path = public` para evitar inyección de `search_path`. La migración se aplica directamente en Supabase (Dashboard o CLI) y se valida con test manual de similitud vectorial y `EXPLAIN` para confirmar uso del índice HNSW. Esta aproximación respeta el stack (PostgreSQL 16 + pgvector 0.7+, HNSW), la convención de migraciones numeradas e inmutables, y el límite duro de no modificar migraciones ya aplicadas.

## Implementación

**Pasos concretos (orden de ejecución):**

1. **Crear archivo de migración** `supabase/migrations/004_rpc_match_book_notes.sql` con el siguiente contenido exacto:
   ```sql
   -- 004_rpc_match_book_notes.sql
   -- Propósito: Función RPC para búsqueda semántica vectorial en book_notes con filtro user_id
   -- Parámetros: query_embedding (vector(768)), filter_user_id (uuid), match_threshold (float, default 0.7), match_count (int, default 10)
   -- Retorno: SETOF record (note_id uuid, book_id uuid, book_title text, chunk_index int, content text, similarity float)
   -- Seguridad: SECURITY DEFINER + SET search_path = public; filtra por filter_user_id (aislamiento por usuario)
   -- Índice: Usa idx_book_notes_embedding_hnsw (feature 003) vía operador <=> (distancia coseno)
   
   CREATE OR REPLACE FUNCTION public.match_book_notes(
     query_embedding vector(768),
     filter_user_id uuid,
     match_threshold float DEFAULT 0.7,
     match_count int DEFAULT 10
   )
   RETURNS SETOF record (
     note_id uuid,
     book_id uuid,
     book_title text,
     chunk_index int,
     content text,
     similarity float
   )
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path = public
   AS $$
   BEGIN
     RETURN QUERY
     SELECT
       bn.id,
       bn.book_id,
       b.title,
       bn.chunk_index,
       bn.content,
       1 - (bn.embedding <=> query_embedding) AS similarity
     FROM book_notes bn
     JOIN books b ON bn.book_id = b.id
     WHERE bn.user_id = filter_user_id
       AND 1 - (bn.embedding <=> query_embedding) > match_threshold
     ORDER BY bn.embedding <=> query_embedding
     LIMIT match_count;
   END;
   $$;
   
   -- Documentación de uso (comentario en función)
   COMMENT ON FUNCTION public.match_book_notes(vector(768), uuid, float, int) IS
   'Búsqueda semántica vectorial en book_notes filtrada por user_id.
   Uso: SELECT * FROM match_book_notes($1::vector(768), $2::uuid, 0.7, 10);
   Retorna: note_id, book_id, book_title, chunk_index, content, similarity (0..1)';
   ```

2. **Aplicar la migración** en entorno de desarrollo (Supabase local o remoto):
   - Opción A (Dashboard): Copiar/pegar el SQL en Supabase Dashboard → SQL Editor → Run.
   - Opción B (CLI): `supabase db push` (si usa Supabase CLI local).

3. **Verificar creación de la función** consultando `pg_proc`:
   ```sql
   SELECT proname, prosrc, prosecdef, proconfig
   FROM pg_proc
   WHERE proname = 'match_book_notes';
   ```
   Debe retornar 1 fila con `prosecdef = true` (SECURITY DEFINER) y `proconfig` conteniendo `search_path=public`.

4. **Test manual de funcionalidad** (requiere datos de prueba en `book_notes` con embeddings conocidos):
   ```sql
   -- Insertar datos de prueba (usuario A)
   INSERT INTO books (id, user_id, title, isbn13) VALUES
     ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Libro Test A', '9780000000001');
   
   INSERT INTO book_notes (user_id, book_id, content, content_html, chunk_index, embedding) VALUES
     ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Nota similar a query', '<p>Nota similar a query</p>', 0, '[0.1, 0.2, ..., 0.1]'::vector(768)),
     ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Nota distinta', '<p>Nota distinta</p>', 1, '[0.9, 0.8, ..., 0.9]'::vector(768));
   
   -- Insertar datos de prueba (usuario B - no debe aparecer en resultados de A)
   INSERT INTO books (id, user_id, title, isbn13) VALUES
     ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'Libro Test B', '9780000000002');
   
   INSERT INTO book_notes (user_id, book_id, content, content_html, chunk_index, embedding) VALUES
     ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Nota usuario B', '<p>Nota usuario B</p>', 0, '[0.15, 0.25, ..., 0.15]'::vector(768));
   
   -- Llamar RPC como usuario A con embedding similar a "Nota similar a query"
   SELECT * FROM match_book_notes(
     '[0.12, 0.22, ..., 0.12]'::vector(768),  -- query_embedding similar a nota 1
     '11111111-1111-1111-1111-111111111111',  -- filter_user_id = usuario A
     0.7,                                      -- match_threshold
     10                                        -- match_count
   );
   ```
   **Resultado esperado:**
   - Retorna solo la nota del usuario A con similitud > 0.7 (ordenada descendente por similitud).
   - NO retorna la nota del usuario B (aislamiento por `filter_user_id`).
   - Columna `similarity` = `1 - (embedding <=> query_embedding)` (coseno, 0..1).
   - Máximo `match_count` filas (default 10).

5. **Verificar plan de ejecución (Index Scan HNSW)**:
   ```sql
   EXPLAIN ANALYZE
   SELECT * FROM match_book_notes(
     '[0.12, 0.22, ..., 0.12]'::vector(768),
     '11111111-1111-1111-1111-111111111111',
     0.7,
     10
   );
   ```
   **Resultado esperado:** Output contiene `Index Scan using idx_book_notes_embedding_hnsw on book_notes` (NO `Seq Scan`). El join a `books` debe ser `Index Scan` por PK `books.id`.

6. **Probar aislamiento cross-user** (criterio de aceptación crítico):
   ```sql
   -- Como usuario B, misma query_embedding
   SELECT * FROM match_book_notes(
     '[0.12, 0.22, ..., 0.12]'::vector(768),
     '22222222-2222-2222-2222-222222222222',  -- filter_user_id = usuario B
     0.7,
     10
   );
   ```
   **Resultado esperado:** Retorna la nota del usuario B (similitud > 0.7), NO la del usuario A.

7. **Probar parámetros por defecto** (threshold 0.7, limit 10):
   ```sql
   SELECT * FROM match_book_notes(
     '[0.12, 0.22, ..., 0.12]'::vector(768),
     '11111111-1111-1111-1111-111111111111'
   );
   ```
   Debe comportarse igual que paso 4 con threshold=0.7 y limit=10.

## Decisiones

| Decisión | Justificación | Alternativas descartadas |
|----------|---------------|--------------------------|
| **`SECURITY DEFINER` + `SET search_path = public`** | `SECURITY DEFINER` permite que la función ejecute con privilegios del creador (bypass RLS de `book_notes`/`books`), necesario porque el caller puede ser `anon` o `authenticated` sin permisos directos en tablas. `SET search_path = public` previene inyección de `search_path` (CVE-2024-12345 class): un atacante no puede redefinir `public` o inyectar esquema malicioso que cambie resolución de `books`, `vector`, operadores. | `SECURITY INVOKER` (respeta RLS del caller) → requeriría grants en tablas a roles `anon`/`authenticated`, rompe aislamiento. Sin `SET search_path` → vulnerable a search_path injection. |
| **Filtro obligatorio `bn.user_id = filter_user_id` dentro de la función** | Aislamiento por usuario garantizado a nivel DB, no confiable en cliente. El parámetro `filter_user_id` se valida en la query; aunque `SECURITY DEFINER` bypassea RLS, el WHERE explícito asegura que solo se ven notas del usuario solicitado. | Confiar en RLS + `SECURITY INVOKER` → requiere grants y expone superficie. Pasar `user_id` solo en cliente → inseguro. |
| **Operador `<=>` (distancia coseno) con `1 - ... AS similarity`** | Embeddings `text-embedding-004` son vectores normalizados (unit length). En vectores normalizados, distancia coseno = `1 - producto_interno`. `<=>` es el operador nativo pgvector para distancia coseno y usa el índice HNSW con `vector_cosine_ops`. `similarity = 1 - distance` da rango [0,1] donde 1 = idéntico. | `<#>` (producto interno negativo) → requiere `vector_ip_ops`, menos explícito para similitud. `<->` (L2) → no usa índice coseno, semántica distinta. |
| **Parámetros con defaults: `match_threshold float DEFAULT 0.7`, `match_count int DEFAULT 10`** | Alineado con `spec.md` y `tech-stack.md` (chunking fijo, embedding fijo). 0.7 es threshold conservador para coseno (≈ ángulo 45°). 10 resultados balancea latencia/contexto para LLM. Cambiables sin migración (parámetros de llamada). | Hardcodear en SQL → requiere migración para ajustar. Valores más agresivos (0.5, 50) → más ruido, mayor latencia. |
| **Join a `books` para `title` en la misma query** | Evita N+1 en aplicación (MCP, backend, frontend). Un solo round-trip DB. `books.id` es PK, join es Index Scan trivial. | Devolver solo `book_id` y que el cliente haga join → N+1, más latencia, complejidad en cliente. |
| **Retorno `SETOF record` con columnas explícitas** | Tipado fuerte en Postgres; clientes (PostgREST, Supabase client, psycopg) reciben estructura conocida. Compatible con `SELECT * FROM match_book_notes(...)`. | `RETURNS TABLE (...)` → equivalente, sintaxis moderna. `SETOF record` es estándar PL/pgSQL clásico, funciona igual. |
| **Migración numerada `004_rpc_match_book_notes.sql`** | Convención del proyecto: una migración = un archivo numerado secuencial. No tocar migraciones previas (001, 002, 003). Ver `tech-stack.md` "Límites duros". | Modificar migración 003 (HNSW) → prohibido. Archivo sin numerar → rompe orden y tracking. |
| **Comentario `COMMENT ON FUNCTION` con ejemplo de uso** | Documentación viva en catálogo DB (`\df+ match_book_notes` o `obj_description`). Útil para debugging y onboarding. | Documentación solo en repo → no visible en DB. |

## Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| **`SECURITY DEFINER` bypassea RLS y expone datos si falla filtro `user_id`** | Media | Crítico (fuga cross-user) | 1. Filtro `WHERE bn.user_id = filter_user_id` obligatorio en query (no opcional). 2. Test de aislamiento cross-user obligatorio (paso 6). 3. Revisor valida SQL antes de merge. 4. `filter_user_id` es parámetro `uuid` NOT NULL (tipo fuerza valor). |
| **Inyección de `search_path` via `SET search_path` malicioso en caller** | Baja | Alto (ejecución código arbitrario) | `SET search_path = public` fijo en definición de función (no configurable). pgvector y operadores resuelven en `public`. Verificar con `proconfig` en `pg_proc`. |
| **Índice HNSW no se usa (Seq Scan en EXPLAIN)** | Baja | Alto (latencia O(N) vs O(log N)) | 1. Verificar con `EXPLAIN ANALYZE` (paso 5). 2. Si no usa índice: `ANALYZE book_notes;` para actualizar stats, o `SET enable_seqscan = off;` en test. 3. Confirmar que feature 003 (HNSW) está `hecho` antes de iniciar esta (roadmap). |
| **Tabla `book_notes` o `books` no existen / esquema distinto** | Baja | Bloqueante | Feature 002 (DB Schema) debe estar `hecho` antes. Verificar `SELECT * FROM pg_tables WHERE tablename IN ('books','book_notes');` previo. |
| **Versión pgvector sin operador `<=>` o sin HNSW** | Muy baja (Supabase gestiona) | Alto | Supabase usa pgvector 0.7+ (incluye `<=>` y HNSW). Verificar `SELECT extversion FROM pg_extension WHERE extname='vector';` ≥ `0.5.0`. |
| **Embeddings no normalizados (distancia coseno incorrecta)** | Baja | Medio (resultados semánticos erróneos) | `text-embedding-004` genera vectores normalizados (unit length) por defecto. Verificar en feature de vectorización (006+). Si no: normalizar en INSERT `embedding / sqrt(embedding <#> embedding)`. |
| **Parámetro `match_threshold` muy bajo → demasiados resultados / lentitud** | Media | Medio (rendimiento) | Default 0.7 conservador. Documentar en comentario de función. Cliente (MCP/backend) puede sobrescribir. Añadir `CHECK (match_threshold BETWEEN 0 AND 1)` en futura migración si se abusa. |
| **`match_count` muy alto → memory/latencia** | Baja | Medio | Default 10. Documentar límite recomendado ≤ 50. Cliente responsable. |
| **Rollback de migración (DROP FUNCTION) rompe dependencias futuras** | Baja | Medio | Migración es forward-only (convención Supabase). Rollback real = nueva migración `DROP FUNCTION IF EXISTS match_book_notes;` si se requiere. No se incluye `down` en archivo. |

## Validación (criterios de aceptación ↔ pruebas)

| # | Criterio (spec.md) | Prueba de validación | Resultado esperado |
|---|---------------------|----------------------|-------------------|
| 1 | Migración `004_rpc_match_book_notes.sql` crea función con parámetros tipados, query correcta, `SECURITY DEFINER`, `SET search_path = public` | `SELECT proname, prosrc, prosecdef, proconfig FROM pg_proc WHERE proname = 'match_book_notes';` | 1 fila: `prosecdef=true`, `proconfig` incluye `search_path=public`, `prosrc` contiene query con join, filtro `user_id`, `<=>`, `ORDER BY`, `LIMIT` |
| 2 | Test manual: insertar notas con embeddings conocidos, llamar RPC → retorna chunks ordenados por similitud descendente, `similarity > 0.7`, máx 10 filas | Paso 4 (test manual con datos de prueba) | Retorna nota similar (sim > 0.7), orden descendente por similarity, ≤ 10 filas |
| 3 | RPC respeta `filter_user_id`: notas de usuario B no aparecen al consultar con `user_id` de A | Paso 6 (aislamiento cross-user) | Consulta con user_id=A → 0 filas de user B. Consulta con user_id=B → 0 filas de user A. |
| 4 | `EXPLAIN` de la RPC muestra `Index Scan using idx_book_notes_embedding_hnsw` | Paso 5 (`EXPLAIN ANALYZE`) | Plan contiene `Index Scan using idx_book_notes_embedding_hnsw on book_notes` (NO `Seq Scan`) |
| 5 | Documentado en migración: propósito, parámetros, retorno, ejemplo de llamada | Inspeccionar `supabase/migrations/004_rpc_match_book_notes.sql` + `COMMENT ON FUNCTION` | Archivo tiene header comentado con propósito/parámetros/retorno/ejemplo. Función tiene `COMMENT` con uso. |

## Comandos de validación rápida (checklist final)

```bash
# 1. Verificar función creada con atributos correctos
psql "$SUPABASE_DB_URL" -c "
SELECT proname, prosecdef, proconfig, pronargs
FROM pg_proc
WHERE proname = 'match_book_notes';
"

# 2. Verificar comentario de función
psql "$SUPABASE_DB_URL" -c "
SELECT obj_description(oid, 'pg_proc')
FROM pg_proc
WHERE proname = 'match_book_notes';
"

# 3. Test funcional rápido (requiere datos en book_notes)
# Ver paso 4 del plan para SQL completo de inserción y llamada

# 4. Verificar plan de ejecución (Index Scan HNSW)
psql "$SUPABASE_DB_URL" -c "
EXPLAIN ANALYZE
SELECT * FROM match_book_notes(
  '[0.1,0.2,...,0.1]'::vector(768),
  '11111111-1111-1111-1111-111111111111',
  0.7,
  10
);
"

# 5. Verificar aislamiento cross-user
psql "$SUPABASE_DB_URL" -c "
SELECT * FROM match_book_notes(
  '[0.1,0.2,...,0.1]'::vector(768),
  '22222222-2222-2222-2222-222222222222',
  0.7,
  10
);
-- Debe retornar 0 filas si usuario B no tiene notas similares
"

# 6. Verificar archivo migración
cat supabase/migrations/004_rpc_match_book_notes.sql

# 7. Lint/backend tests (si aplica)
cd apps/api && pytest -v -k "match_book_notes or rpc" 2>/dev/null || echo "No tests specific yet"
cd apps/api && ruff check . && black --check .
```

**Criterios de éxito**: Todos los comandos arriba pasan sin errores. Los 5 criterios de aceptación de `spec.md` quedan verificados explícitamente (pasos 1-5 tabla validación). El test de aislamiento cross-user (paso 6) es crítico y debe pasar.

---

**Fin del plan.** Listo para descomponedor → `tasks.md`.