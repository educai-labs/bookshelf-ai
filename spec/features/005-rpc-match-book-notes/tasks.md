# 005 · RPC match_book_notes — Checklist de tareas

> **Fuente**: despachado desde `spec/features/005-rpc-match-book-notes/plan.md`
> **Objetivo**: Desglosar los 7 pasos de implementación + validaciones en tareas pequeñas, concretas y verificables (checklist `[ ]`).
> **Regla**: una acción = un archivo, un comando o un verificación concreta. Marcar `[ ]` al completar.

---

## Checklist principal

### 1. Crear archivo de migración SQL
- [x] Crear `supabase/migrations/005_rpc_match_book_notes.sql` con el contenido exacto especificado en `plan.md` (paso 1):
  > **Nota de numeración (desviación documentada)**: el plan/tasks pedían `004_rpc_match_book_notes.sql`, pero ya existe `supabase/migrations/004_rls_policies.sql` (feature 004, hecha). Según `tech-stack.md` la numeración de migraciones es secuencial única y la migración = nº de feature → se creó `005_rpc_match_book_notes.sql`. Contenido SQL idéntico al especificado.
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
- [x] Verificar que el archivo tiene encabezado comentado con: propósito, parámetros, retorno, ejemplo de llamada.
- [x] Verificar que incluye `COMMENT ON FUNCTION` con descripción de uso.

### 2. Aplicar la migración en entorno de desarrollo
- [x] Aplicar migración en Supabase (Dashboard: SQL Editor → Run, o CLI: `supabase db push`).
  > **Nota de entorno**: `psql` no está instalado y el Supabase CLI local requiere Docker (no disponible). Se aplicó la migración contra la BD remota usando el cliente `pg` (equivalente a SQL Editor). Output: `CREATE FUNCTION` sin errores.
  > **Corrección aplicada**: la sintaxis `RETURNS SETOF record (col type, ...)` NO es válida en PostgreSQL (error `syntax error at or near "uuid"`). Se usó `RETURNS TABLE (...)` (equivalente funcional, documentado como alternativa válida en `plan.md` sección Decisiones).
- [x] Confirmar que no hay errores de sintaxis ni de ejecución (`OUTPUT: CREATE FUNCTION`).
- [x] Anotar hash/identificador de la migración aplicada para rastreo: `sha256: a9c2683048fbee85` de `supabase/migrations/005_rpc_match_book_notes.sql`. (Migración aplicada directamente vía cliente `pg`; no queda registro en `supabase_migrations.schema_migrations` porque no se usó `db push`.)

### 3. Verificar creación de la función (atributos DB)
- [x] Ejecutar consulta atómica contra `pg_proc`:
  ```sql
  SELECT proname, prosecdef, proconfig, pronargs
  FROM pg_proc
  WHERE proname = 'match_book_notes';
  ```
  Resultado: `{"proname":"match_book_notes","prosecdef":true,"proconfig":["search_path=public"],"pronargs":4}` (1 fila).
- [x] Validar `prosecdef = true` (SECURITY DEFINER). → **OK** (`prosecdef: true`)
- [x] Validar que `proconfig` contiene `search_path=public`. → **OK** (`["search_path=public"]`)
- [x] Validar `pronargs = 4` (cuatro parámetros definidos). → **OK** (`pronargs: 4`)

### 4. Test manual de funcionalidad (insertar datos + llamar RPC)
- [x] Insertar datos de prueba para usuario A (crear libro y book_notes con embeddings conocidos):
  > **Requisito previo**: la FK `books.user_id → auth.users(id)` exige usuarios existentes. `auth.users` estaba vacío → se crearon 2 usuarios de prueba (`test-a@bookshelf.test` y `test-b@bookshelf.test` con los UUID `11111111-...` y `22222222-...`).
  > **Nota sobre embeddings**: `[0.1, 0.2, 0.1]::vector(768)` del checklist es un placeholder; un `vector(768)` exige exactamente 768 dimensiones. Se generaron vectores reales de 768 dims: "Nota similar" con valores en dims 0-2 (similitud ≈ 0.999 con el query), "Nota distinta" con valores en dims 700-702 (ortogonal al query, similitud ≈ 0 < 0.7, por lo que NO debe aparecer), "Nota usuario B" con valores en dims 0-2 (similitud ≈ 0.999).
- [x] Insertar datos de prueba para usuario B (aislamiento): libro `bbbbbbbb-...` + 1 nota con embedding similar al query.
- [x] Llamar RPC como usuario A con embedding similar a "Nota similar a query" (query dims 0-2 = [0.12, 0.22, 0.12]):
  ```sql
  SELECT * FROM match_book_notes('[0.12,0.22,0.12,0,...,0]'::vector(768), '11111111-1111-1111-1111-111111111111', 0.7, 10);
  ```
- [x] **Criterio `done`**: Retorna solo la nota del usuario A con similitud > 0.7, orden descendente por similarity, máximo 10 filas. NO retorna notas del usuario B.
  → **OK**: 1 fila `{"note_id":"253a6f9e-...","book_id":"aaaaaaaa-...","book_title":"Libro Test A","chunk_index":0,"content":"Nota similar a query","similarity":0.99913613240577}`. La "Nota distinta" (sim ≈ 0) queda filtrada por threshold; 0 filas del usuario B.

### 5. Verificar plan de ejecución (EXPLAIN ANALYZE — Index Scan HNSW)
- [x] Ejecutar `EXPLAIN ANALYZE` de la RPC:
  > **Nota técnica**: `EXPLAIN ANALYZE SELECT * FROM match_book_notes(...)` sobre una función plpgsql muestra solo `Function Scan` (PostgreSQL no expande el plan interno de plpgsql). Para validar el plan real se ejecutó `EXPLAIN ANALYZE` sobre la query interna exacta de la función (mismos joins, filtros, ORDER BY, LIMIT).
- [x] **Criterio `done`**: Output contiene `Index Scan using idx_book_notes_embedding_hnsw on book_notes` (NO `Seq Scan`).
  → **OK tras mitigación**: con solo 3 filas en la tabla el optimizador elige `Bitmap Index Scan on idx_book_notes_user_id` / `Seq Scan` (HNSW no es rentable con volumen nulo). Se insertaron 3000 filas de volumen de prueba (embeddings aleatorios normalizados), `ANALYZE book_notes`, y el plan pasó a:
  ```
  -> Index Scan using idx_book_notes_embedding_hnsw on book_notes bn  (Filter: user_id + threshold)
  -> Index Scan using books_pkey on books b  (Index Cond: id = bn.book_id)
  ```
  Sin `Seq Scan`. Las 3000 filas de volumen se eliminaron tras la validación (BD queda con las 3 filas de prueba canónicas) y se re-ejecutó `ANALYZE`.
- [x] El join a `books` debe aparecer como `Index Scan` por PK `books.id`. → **OK** (`Index Scan using books_pkey on books b`, `Index Cond: (id = bn.book_id)`).
- [x] Si no usa índice HNSW: ejecutar `ANALYZE book_notes;` y repetir EXPLAIN hasta confirmar Index Scan. → **Aplicado** (ver nota anterior: ANALYZE + volumen de datos; el índice HNSW se confirma con datos representativos).

### 6. Probar aislamiento cross-user (criterio de aceptación crítico)
- [x] Ejecutar consulta como usuario B con misma query_embedding:
  ```sql
  SELECT * FROM match_book_notes('[0.12,0.22,0.12,0,...,0]'::vector(768), '22222222-2222-2222-2222-222222222222', 0.7, 10);
  ```
- [x] **Criterio `done`**: Retorna la nota del usuario B (similitud > 0.7), NO la del usuario A.
  → **OK**: 1 fila `{"note_id":"e653b66d-...","book_id":"bbbbbbbb-...","book_title":"Libro Test B","content":"Nota usuario B","similarity":0.998915025511473}`. Fugas de datos de A en B: 0.
- [x] Verificar reciprocidad: consultar con user_id=A sobre datos de user B → 0 filas.
  → **OK**: la consulta de A retorna solo `aaaaaaaa-...` (Libro Test A); 0 filas con `book_id = bbbbbbbb-...`. Fugas de datos de B en A: 0.
- [x] Este es un **criterio de aceptación crítico** — debe pasar antes de marcar feature como hecha. → **PASA** (aislamiento bidireccional confirmado).

### 7. Probar parámetros por defecto
- [x] Llamar a la RPC sin especificar `match_threshold` ni `match_count` (usar solo `query_embedding` y `filter_user_id`):
  ```sql
  SELECT * FROM match_book_notes('[0.12,0.22,0.12,0,...,0]'::vector(768), '11111111-1111-1111-1111-111111111111');
  ```
- [x] **Criterio `done`**: Comportamiento idéntico al paso 4 con threshold=0.7 y limit=10 (default).
  → **OK**: 1 fila idéntica al paso 4 (misma `note_id` y `similarity: 0.99913613240577`).
- [x] Validar que los defaults están definidos en la firma `CREATE OR REPLACE FUNCTION` (`DEFAULT 0.7`, `DEFAULT 10`).
  → **OK**: `pg_get_function_arguments` devuelve `query_embedding vector, filter_user_id uuid, match_threshold double precision DEFAULT 0.7, match_count integer DEFAULT 10`.

### 8. Documentación en migración (COMMENT ON FUNCTION)
- [x] Verificar que el `COMMENT ON FUNCTION` está presente y legible en BD:
  ```sql
  SELECT obj_description(oid, 'pg_proc')
  FROM pg_proc
  WHERE proname = 'match_book_notes';
  ```
  → **OK** (ver resultado abajo).
- [x] Confirmar que el comentario incluye: propósito, parámetros, ejemplo de llamada (`SELECT * FROM match_book_notes($1::vector(768), $2::uuid, 0.7, 10)`).
  → **OK**: `obj_description` devuelve: "Búsqueda semántica vectorial en book_notes filtrada por user_id. Uso: SELECT * FROM match_book_notes($1::vector(768), $2::uuid, 0.7, 10); Retorna: note_id, book_id, book_title, chunk_index, content, similarity (0..1)". Incluye propósito, ejemplo de llamada y estructura de retorno.
- [x] Si falta, añadir comentario a la migración o ejecutar `COMMENT ON FUNCTION` manualmente. → No fue necesario (ya incluido en la migración y aplicado).

---

## Mantenimiento (opcional — solo si la feature requiere acciones recurrentes)

> *Borra esta sección si la feature no necesita mantenimiento recurrente.*

> Tareas recurrentes que podrían ser necesarias al tocar esta feature en el futuro:
> - [ ] Actualizar embeddings de book_notes tras cambiar modelo de vectorización (feature 006+).
> - [ ] Reindexar HNSW (`ALTER INDEX idx_book_notes_embedding_hnsw REINDEX`) si se degradan los results.
> - [ ] Verificar compatibilidad pgvector versión posterior tras upgrade Supabase.

---

## Resumen de validación final (checklist rápido)

> *Ejecutar tras completar todas las tareas anteriores:*

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

# 3. Test funcional rápido (ver SQL en tarea 4)
# 4. Verificar plan de ejecución (Index Scan HNSW) (ver tarea 5)
# 5. Verificar aislamiento cross-user (ver tarea 6)
# 6. Verificar archivo migración con encabezado y COMMENT ON FUNCTION (ver tarea 1 y 8)
# 7. Lint/backend tests (si aplica)
cd apps/api && pytest -v -k "match_book_notes or rpc" 2>/dev/null || echo "No tests specific yet"
cd apps/api && ruff check . && black --check .
```

### Resultado de la ejecución (2026-08-17)

> **Nota de entorno**: `psql` no está instalado en este entorno y el Supabase CLI local requiere Docker (no disponible). Todos los comandos SQL se ejecutaron con el cliente `pg` (Node) contra la BD remota `SUPABASE_DB_URL` de `.env.local` — semánticamente equivalente a `psql`/SQL Editor. Resultados:

1. **Atributos de función** → `{"proname":"match_book_notes","prosecdef":true,"proconfig":["search_path=public"],"pronargs":4}` — **PASA**
2. **Comentario de función** → presente con propósito, ejemplo de llamada `SELECT * FROM match_book_notes($1::vector(768), $2::uuid, 0.7, 10)` y estructura de retorno — **PASA**
3. **Test funcional** → 1 fila del usuario A, `similarity 0.99913613240577 > 0.7`, sin notas de B — **PASA**
4. **EXPLAIN ANALYZE** → con 3000 filas de volumen: `Index Scan using idx_book_notes_embedding_hnsw` + `Index Scan using books_pkey` (sin `Seq Scan`); volumen eliminado tras validar — **PASA**
5. **Aislamiento cross-user** → B ve solo su nota, A ve solo la suya, 0 fugas bidireccionales — **PASA**
6. **Archivo migración** → `supabase/migrations/005_rpc_match_book_notes.sql` con encabezado completo + `COMMENT ON FUNCTION` — **PASA**
7. **Lint/backend tests** → no ejecutables en este entorno: `pytest`, `ruff` y `black` no están instalados (Python sin pip). `apps/api` solo contiene el test de integración RLS (feature 004); no existen tests de `match_book_notes` (el endpoint API que la consume es feature 017). Se deja anotado para CI.

**Criterios de éxito**: Todos los `[ ]` del checklist principal marcado `[x]`. Los 5 criterios de aceptación de `spec.md` verificados explícitamente (migración, test funcional, cross-user, Index Scan HNSW, documentación). Sin errores en `EXPLAIN ANALYZE`, aislamiento cross-user o atributos de función.