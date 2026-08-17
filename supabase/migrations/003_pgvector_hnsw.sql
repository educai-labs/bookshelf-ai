-- 003 · pgvector + HNSW Indexes
-- Habilita la extensión `vector` (idempotente) y crea el índice HNSW
-- `idx_book_notes_embedding_hnsw` sobre `book_notes.embedding` usando
-- `vector_cosine_ops` (embeddings normalizados de text-embedding-004, 768 dims).
--
-- Parámetros HNSW: m = 16, ef_construction = 64 (balance recall/latencia/espacio).
--
-- Aplicación: `supabase db push` (proyecto linkado) o `psql "$SUPABASE_DB_URL" -f <archivo>`.
-- Idempotente: re-ejecutable sin error gracias a IF NOT EXISTS.

-- up
CREATE EXTENSION IF NOT EXISTS vector;

CREATE INDEX IF NOT EXISTS idx_book_notes_embedding_hnsw
  ON book_notes
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- down (comentado: convención forward-only Supabase; referencia para rollback manual)
-- Orden importante: primero el índice (depende de la extensión), luego la extensión.
-- NO usar CASCADE: borraría objetos dependientes silenciosamente.
-- Si DROP EXTENSION falla, revisar dependencias antes de CASCADE.
-- DROP INDEX IF EXISTS idx_book_notes_embedding_hnsw;
-- DROP EXTENSION IF EXISTS vector;
