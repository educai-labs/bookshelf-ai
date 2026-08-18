-- 005_rpc_match_book_notes.sql
-- Propósito: Función RPC para búsqueda semántica vectorial en book_notes con filtro user_id
-- Parámetros: query_embedding (vector(768)), filter_user_id (uuid), match_threshold (float, default 0.7), match_count (int, default 10)
-- Retorno: TABLE (note_id uuid, book_id uuid, book_title text, chunk_index int, content text, similarity float)
-- Seguridad: SECURITY DEFINER + SET search_path = public; filtra por filter_user_id (aislamiento por usuario)
-- Índice: Usa idx_book_notes_embedding_hnsw (feature 003) vía operador <=> (distancia coseno)
--
-- Aplicación: `supabase db push` (proyecto linkado) o `psql "$SUPABASE_DB_URL" -f <archivo>`.
-- Nota de numeración: el archivo se numera 005 (nº de feature), ya que 004 ya está
-- ocupado por la migración 004_rls_policies.sql (feature 004 RLS Policies).
-- Nota de retorno: la sintaxis `RETURNS SETOF record (col type, ...)` NO es válida en
-- PostgreSQL; se usa `RETURNS TABLE (...)` (equivalente funcional, ver plan.md Decisiones).

CREATE OR REPLACE FUNCTION public.match_book_notes(
  query_embedding vector(768),
  filter_user_id uuid,
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10
)
RETURNS TABLE (
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