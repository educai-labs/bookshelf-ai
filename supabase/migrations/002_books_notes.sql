-- 002 · DB Schema Books & Notes
-- Tablas `books` y `book_notes` con PK, FK, constraints, enum `book_status`,
-- trigger `set_updated_at` e índices de apoyo.
--
-- Aplicación: `supabase db push` (proyecto linkado) o `supabase db reset` (local).
-- Requisito: pgvector (habilitado aquí con IF NOT EXISTS, y en migración 001).

-- ============================================================
-- UP
-- ============================================================

-- pgvector: asegurar que el tipo `vector` existe antes de `book_notes`
-- (idempotente; la migración 001 ya lo habilita).
CREATE EXTENSION IF NOT EXISTS vector;

-- Enum book_status (idempotente: PostgreSQL no soporta CREATE TYPE IF NOT EXISTS,
-- se usa DO block con guarda sobre pg_type).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'book_status') THEN
    CREATE TYPE book_status AS ENUM ('want_to_read', 'reading', 'read');
  END IF;
END
$$;

-- Tabla books
CREATE TABLE books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  isbn13 char(13),
  title text NOT NULL,
  authors text[] NOT NULL DEFAULT '{}',
  cover_url text,
  page_count int CHECK (page_count > 0),
  publisher text,
  published_date date,
  description text,
  status book_status NOT NULL DEFAULT 'want_to_read',
  rating smallint CHECK (rating BETWEEN 1 AND 5),
  started_at date,
  finished_at date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- UNIQUE compuesto por user_id: mismo ISBN permitido para usuarios distintos.
  CONSTRAINT books_isbn13_unique UNIQUE (user_id, isbn13),
  -- Formato ISBN-13: exactamente 13 dígitos.
  CONSTRAINT books_isbn13_format CHECK (isbn13 ~ '^\d{13}$')
);

-- Tabla book_notes (chunks de notas con embedding vectorial)
CREATE TABLE book_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  content text NOT NULL,
  content_html text NOT NULL,
  chunk_index int NOT NULL,
  embedding vector(768) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Trigger updated_at sobre books
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_set_updated_at_books
BEFORE UPDATE ON books
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Índices de apoyo (FK user_id en ambas tablas, FK book_id en book_notes)
-- para rendimiento de RLS y joins futuros.
CREATE INDEX idx_books_user_id ON books(user_id);
CREATE INDEX idx_book_notes_user_id ON book_notes(user_id);
CREATE INDEX idx_book_notes_book_id ON book_notes(book_id);

-- ============================================================
-- DOWN (reversión completa, orden inverso)
-- NOTA: Supabase ejecuta cada migración de forma forward-only;
-- el bloque DOWN se documenta aquí como referencia para revertir
-- manualmente (no se ejecuta por `supabase db push`). Reversión
-- en producción = nueva migración con los DROP.
-- ============================================================
-- DROP TRIGGER IF EXISTS trigger_set_updated_at_books ON books;
-- DROP FUNCTION IF EXISTS set_updated_at();
-- DROP TABLE IF EXISTS book_notes;
-- DROP TABLE IF EXISTS books;
-- DROP TYPE IF EXISTS book_status;