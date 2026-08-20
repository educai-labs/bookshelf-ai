# 003 · pgvector + HNSW Indexes

**Estado:** hecho

## Qué hace

Habilita la extensión `vector` en Supabase/PostgreSQL y crea un índice HNSW (Hierarchical Navigable Small World) en la columna `embedding` de la tabla `book_notes` para búsqueda por similitud coseno eficiente. El comando `CREATE EXTENSION vector` está idempotente y el índice usa el operador `vector_cosine_ops` para comparar embeddings normalizados (768 dims, modelo `text-embedding-004`).

## Por qué

Necesario para la feature 005 (RPC `match_book_notes`) y 016/017 (búsqueda semántica y chat RAG). Sin índice HNSW, PostgreSQL realiza una búsqueda secuencial O(n) sobre la columna `embedding`, lo que es inutilizable a cientos o miles de notas. HNSW ofrece rendimiento O(log n) con recall ~95-99% y latencia sub-milisegundo, lo que permite búsquedas interactivas en la UI. El operador `vector_cosine_ops` está alineado con los embeddings normalizados que produce `text-embedding-004`.

## Criterios de aceptación

- [ ] Extensión `vector` creada en la BD: `SELECT * FROM pg_extension WHERE extname = 'vector'` retorna fila.
- [ ] Índice HNSW existe en `book_notes.embedding` con `vector_cosine_ops`: `\d book_notes` muestra `USING hnsw` en la línea del índice.
- [ ] El índice soporta consultas `ORDER BY embedding <=> $1 LIMIT k` con plan de ejecución `Index Scan using ... hnsw` (verificable con `EXPLAIN ANALYZE`).
- [ ] Migración SQL versionada en `supabase/migrations/` (archivo `003_pgvector_hnsw.sql`) y aplicable con `supabase db push` o `psql`. Bloque `down` comentado (convención del repo); migración aplicable con `supabase db push --include-all`.
- [ ] Bloque `down` presente en archivo como referencia documentada (comentado). `DROP INDEX` probado manualmente. `DROP EXTENSION vector` documentado como requiere eliminación previa de objetos dependientes (tabla `book_notes` / columna `embedding`). Rollback real = ejecución manual de sentencias down o nueva migración inversa.

## Fuera de alcance

- [ ] Poblar embeddings en `book_notes` (feature 016: Note Vectorization Pipeline).
- [ ] RPC `match_book_notes` que consume el índice (feature 005).
- [ ] Políticas RLS sobre `book_notes` (feature 004).
- [ ] Benchmarks de recall/latencia (se harán validación en feature 017).
- [ ] Rollback automático via Supabase CLI (no soportado por convención forward-only).

---
*Plantilla SDD — especificación living document. No contiene detalles de implementación (eso es `plan.md`).*