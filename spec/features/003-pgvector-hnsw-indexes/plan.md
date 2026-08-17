# Plan de implementación — 003 · pgvector + HNSW Indexes

## Enfoque general

Estrategia **migración SQL pura via Supabase**, idempotente y versionada. Se crea un único archivo de migración en `supabase/migrations/003_pgvector_hnsw.sql` con bloque `up` explícito y bloque `down` **comentado** (convención forward-only Supabase). La migración:
- Habilita la extensión `vector` con `IF NOT EXISTS` (idempotente, evita errores si ya existe en Supabase).
- Crea índice HNSW en `book_notes.embedding` usando operador `vector_cosine_ops` (alineado con embeddings normalizados de `text-embedding-004`, 768 dims).
- Parámetros HNSW: `m = 16, ef_construction = 64` (balance recall/latencia/espacio estándar para 768 dims).
- Rollback `down` documentado como referencia en comentarios; ejecución manual o nueva migración si se requiere.

No se tocan otras migraciones ni código de aplicación. La feature es puramente DDL de base de datos.

---

## Implementación paso a paso

### 1. Crear archivo de migración
**Archivo:** `supabase/migrations/003_pgvector_hnsw.sql`

```sql
-- up
CREATE EXTENSION IF NOT EXISTS vector;

CREATE INDEX IF NOT EXISTS idx_book_notes_embedding_hnsw
  ON book_notes
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- down (comentado: convención forward-only Supabase; referencia para rollback manual)
-- DROP INDEX IF EXISTS idx_book_notes_embedding_hnsw;
-- DROP EXTENSION IF EXISTS vector;
```

> **Nota:** El bloque `down` se comenta siguiendo la convención forward-only de Supabase (ver feature 002). El orden en `down` importa: primero el índice (depende de la extensión), luego la extensión. Se mantiene como referencia documentada para rollback manual.

### 2. Aplicar migración en entorno local / staging
```bash
# Supabase CLI (requerido --include-all por numeración 003 < timestamps ya aplicados)
supabase db push --include-all
```

### 3. Verificar creación de extensión
```sql
SELECT * FROM pg_extension WHERE extname = 'vector';
-- Debe retornar 1 fila con extname = 'vector'
```

### 4. Verificar índice HNSW
```sql
-- Via psql
\d book_notes
-- Buscar línea: "idx_book_notes_embedding_hnsw" USING hnsw (embedding vector_cosine_ops)

-- Via query
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'book_notes' AND indexdef LIKE '%hnsw%';
```

### 5. Verificar plan de ejecución (Index Scan HNSW)
```sql
-- Requiere al menos 1 fila en book_notes (aunque sea embedding dummy)
EXPLAIN ANALYZE
SELECT * FROM book_notes
ORDER BY embedding <=> '[0,0,...,0]'::vector(768)
LIMIT 5;
-- Output esperado: "Index Scan using idx_book_notes_embedding_hnsw on book_notes ..."
```

### 6. Probar rollback (manual, en entorno de test)
```bash
-- DROP INDEX: prueba manual (ejecución directa en psql)
psql "$SUPABASE_DB_URL" -c "DROP INDEX IF EXISTS idx_book_notes_embedding_hnsw;"

-- DROP EXTENSION vector: NO se prueba en este ciclo
-- Requiere borrar tabla book_notes primero (dependencias), fuera de alcance.
-- Rollback real documentado como: ejecución manual de sentencias comentadas
-- O creación de nueva migración de rollback explícita si se necesita en producción.
```

---

## Decisiones técnicas

| Decisión | Justificación | Alternativas descartadas |
|----------|---------------|--------------------------|
| **Parámetros HNSW `m=16, ef_construction=64`** | Valores por defecto recomendados por pgvector para 768 dims. `m=16` da buen recall (~95-99%) con memoria moderada. `ef_construction=64` balancea tiempo de build vs calidad. Aumentar `m` mejora recall pero crece índice linealmente; aumentar `ef_construction` ralentiza inserciones. | `m=32` (más memoria, recall marginal), `ef_construction=128` (build más lento sin ganancia clara). |
| **`IF NOT EXISTS` en extensión e índice** | Idempotencia: la migración puede ejecutarse varias veces sin error (CI/CD, re-ejecución, staging→prod). Supabase a veces pre-instala `vector`. | Sin `IF NOT EXISTS` → falla en re-ejecución; requiere `DROP` manual previo. |
| **Operador `vector_cosine_ops`** | Embeddings de `text-embedding-004` vienen normalizados (unit length). Coseno = producto interno en vectores normalizados. Más eficiente que `vector_l2_ops` (distancia euclidiana) para similitud semántica. | `vector_l2_ops` (requiere embeddings no normalizados o conversión), `vector_ip_ops` (producto interno, igual a coseno si normalizados pero menos explícito). |
| **Extensión en esquema `public`** | Comportamiento por defecto de `CREATE EXTENSION vector` en Supabase. RPC `match_book_notes` (feature 005) buscará operadores en `public`. | Esquema dedicado (`extensions` o `vector`) → requiere `SET search_path` en RPC, complejidad innecesaria. |
| **Archivo único `003_pgvector_hnsw.sql`** | Convención del proyecto: una migración = un archivo numerado. No tocar migraciones previas (001, 002). Rollback atómico en un archivo. | Separar en 2 migraciones (extensión + índice) → rollback parcial, más archivos, sin beneficio. |
| **Bloque `down` comentado en migración** | Convención forward-only Supabase (ver 002); evita ejecución accidental de DROPs que fallan por dependencias; referencia documentada para rollback manual. | Bloque `down` activo con `IF EXISTS` → riesgo de ejecutar `DROP EXTENSION` que falla por dependencias (columnas, índices) sin `CASCADE`; `CASCADE` es peligroso. |
| **`DROP EXTENSION IF EXISTS vector` en down (comentado)** | Limpieza completa documentada. `IF EXISTS` evita error si ya no existe. `CASCADE` NO se usa (ver Riesgos). | `DROP EXTENSION vector CASCADE` → elimina objetos dependientes silenciosamente (peligroso). |

---

## Riesgos y mitigación

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| **Extensión `vector` ya existe en Supabase** | Alta | Bajo | `CREATE EXTENSION IF NOT EXISTS` lo absorbe sin error. |
| **Tabla `book_notes` no existe aún** | Media | Alto | Feature 002 (DB Schema + RLS) debe estar **hecha** antes de iniciar esta. Verificar en `roadmap.md` que 002 = `hecho`. Si no, bloquear inicio. |
| **Versión pgvector < 0.5 (sin HNSW)** | Baja (Supabase gestiona) | Alto | Supabase usa pgvector 0.7+. Verificar con `SELECT extversion FROM pg_extension WHERE extname='vector';` ≥ `0.5.0`. |
| **PostgreSQL < 12 (sin soporte HNSW)** | Muy baja | Alto | Supabase usa PG 16. No aplica. |
| **Rollback `DROP EXTENSION vector` falla por dependencias** | Media | Medio | Bloque `down` comentado; rollback manual documentado; no se ejecuta `CASCADE`. Si se necesita rollback real: nueva migración explícita o ejecución manual tras limpiar dependencias. |
| **Índice HNSW no se usa (Seq Scan en EXPLAIN)** | Baja | Alto | Verificar con `EXPLAIN ANALYZE` que aparece `Index Scan using idx_book_notes_embedding_hnsw`. Si no: `ANALYZE book_notes;` para actualizar estadísticas, o forzar con `SET enable_seqscan = off;` en test. |
| **Parámetros HNSW subóptimos para volumen real** | Baja | Medio | Valores por defecto conservadores. Ajuste fino (feature 017 benchmarks) → nueva migración `ALTER INDEX ... SET (m = ..., ef_construction = ...);` si necesario. |

---

## Validación (criterios de aceptación ↔ pruebas)

| # | Criterio (spec.md) | Prueba de validación | Resultado esperado |
|---|---------------------|----------------------|-------------------|
| 1 | Extensión `vector` creada | `SELECT * FROM pg_extension WHERE extname = 'vector';` | 1 fila con `extname = 'vector'`, `extversion ≥ '0.5.0'` |
| 2 | Índice HNSW en `book_notes.embedding` con `vector_cosine_ops` | `\d book_notes` **o** `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'book_notes' AND indexdef LIKE '%hnsw%';` | Muestra `idx_book_notes_embedding_hnsw` con `USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64)` |
| 3 | Plan de ejecución usa Index Scan HNSW | `EXPLAIN ANALYZE SELECT * FROM book_notes ORDER BY embedding <=> $1 LIMIT 5;` (con `$1` = vector dummy 768 dims) | Output contiene `Index Scan using idx_book_notes_embedding_hnsw on book_notes` (no `Seq Scan`) |
| 4 | Migración versionada en `supabase/migrations/003_pgvector_hnsw.sql` con bloque `up` y `down` comentado | `ls supabase/migrations/003_pgvector_hnsw.sql` + inspección contenido | Archivo existe, contiene bloque `up` con `CREATE EXTENSION` e `INDEX`; bloque `down` comentado con `DROP INDEX` y `DROP EXTENSION` como referencia |
| 5 | Rollback documentado y probado parcialmente (DROP INDEX manual) | 1. `psql -c "DROP INDEX IF EXISTS idx_book_notes_embedding_hnsw;"` 2. Verificar que índice desaparece 3. `DROP EXTENSION` no se prueba (requiere limpiar `book_notes` primero) | Índice eliminado correctamente. Extensión permanece (comportamiento esperado). Rollback completo documentado como ejecución manual o nueva migración. |

---

## Comandos de validación rápida (checklist final)

```bash
# 1. Extensión
psql "$SUPABASE_DB_URL" -c "SELECT extname, extversion FROM pg_extension WHERE extname='vector';"

# 2. Índice
psql "$SUPABASE_DB_URL" -c "SELECT indexname, indexdef FROM pg_indexes WHERE tablename='book_notes' AND indexdef LIKE '%hnsw%';"

# 3. Plan de ejecución (requiere dato dummy en book_notes)
psql "$SUPABASE_DB_URL" -c "
INSERT INTO book_notes (user_id, book_id, content, content_html, chunk_index, embedding)
VALUES ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', 'test', 'test', 0, '[0,0,0]'::vector(768)); -- ajustar dims a 768
EXPLAIN ANALYZE SELECT * FROM book_notes ORDER BY embedding <=> '[0,0,0]'::vector(768) LIMIT 5;
"

# 4. Archivo migración
cat supabase/migrations/003_pgvector_hnsw.sql

# 5. Rollback test parcial (DROP INDEX manual, en rama/test DB)
psql "$SUPABASE_DB_URL" -c "DROP INDEX IF EXISTS idx_book_notes_embedding_hnsw;"
# Verificar que índice ya no existe
psql "$SUPABASE_DB_URL" -c "SELECT indexname FROM pg_indexes WHERE tablename='book_notes' AND indexname='idx_book_notes_embedding_hnsw';"
# Debe retornar 0 filas. Extensión 'vector' permanece.
```

---

**Fin del plan.** Listo para descomponedor → `tasks.md`.