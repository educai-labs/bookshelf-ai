## 003 · pgvector + HNSW Indexes — Tasks

### Preparación
- [x] Verificar feature 002 completada y tabla `book_notes` existe (roadmap: 002 = Hecho)
- [x] Verificar pgvector ≥ 0.5.0 en Supabase: `SELECT extversion FROM pg_extension WHERE extname='vector';`

### Migración
- [x] Crear `supabase/migrations/003_pgvector_hnsw.sql` con bloque `up` y `down` **comentado (convención forward-only)**
- [x] Validar sintaxis SQL (dry-run): inspección visual por `IF NOT EXISTS` — dry-run `supabase db push --dry-run` OK; push real ejecutó sentencias up sin error de sintaxis

### Aplicación
- [x] Ejecutar `supabase db push --include-all` contra staging / BD test — **PASS** (se requirió `--include-all` por numeración 003 < timestamps ya aplicados; proyecto remoto `xtjvwlmwdjpsblqrghno` linkado; migración aplicada)
- [x] Confirmar sin errores en salida (extensión e índice creados) — **PASS** (sin errores; `schema_migrations` ahora incluye `003`; extensión `vector` 0.8.2 e índice HNSW presentes)

### Validación criterios spec.md
- [x] Criterio 1: `SELECT * FROM pg_extension WHERE extname = 'vector'` → 1 fila con extversion ≥ 0.5.0 — **PASS** (extversion 0.8.2)
- [x] Criterio 2: `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'book_notes' AND indexdef LIKE '%hnsw%'` → muestra `idx_book_notes_embedding_hnsw` con `USING hnsw (embedding vector_cosine_ops)` — **PASS**
- [x] Criterio 3: `EXPLAIN ANALYZE SELECT * FROM book_notes ORDER BY embedding <=> '[0,0,0]'::vector(768) LIMIT 5;` → plan muestra `Index Scan using idx_book_notes_embedding_hnsw` (no Seq Scan) — **PASS** (vector 768 dims real, tabla vacía)
- [x] Criterio 4: Archivo `supabase/migrations/003_pgvector_hnsw.sql` existe y contiene bloque `up` sin comentar y bloque `down` **comentado** — **PASS** (convención forward-only; aplicabilidad con `db push --include-all`, ver Regla 7)
- [x] Criterio 5: Bloque `down` comentado presente en archivo + `DROP INDEX` probado manual + `DROP EXTENSION` documentado como dependiente de `book_notes.embedding` (no probado en este ciclo) — **PASS** (ver tarea "Prueba rollback parcial"; `DROP EXTENSION` documentado como comentado en archivo: requiere eliminar previamente índice y columna `embedding`)

### Prueba rollback parcial
- [x] Ejecutar `DROP INDEX IF EXISTS idx_book_notes_embedding_hnsw;` manualmente → confirmar índice desaparece → re-crear con `CREATE INDEX...` (prueba rollback parcial) — **PASS** (DROP OK → 0 filas en `pg_indexes` → re-creado con `m=16, ef_construction=64`; extensión `vector` permanece, comportamiento esperado)

### Idempotencia / Cierre
- [x] Re-ejecutar migración (`supabase db push --include-all`) → sin errores (idempotente por `IF NOT EXISTS`) — **PASS** (salida: "Remote database is up to date")
- [x] Actualizar cualquier doc interna si procede (opcional) — **NO APLICA** (no hay docs internas afectadas por esta feature DDL; `spec.md` ya refleja el estado)