-- 004 · RLS Policies
-- Habilita Row Level Security en `books` y `book_notes` y define políticas `ALL`
-- que restringen el acceso a filas donde `auth.uid() = user_id`.
--
-- Aplicación: `supabase db push` (proyecto linkado).
-- Requisito: tablas `books` y `book_notes` creadas (migración 002).

-- ============================================================
-- UP
-- ============================================================

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

-- ============================================================
-- DOWN (referencia manual; Supabase ejecuta forward-only)
-- ============================================================
-- DROP POLICY IF EXISTS book_notes_user_isolation ON book_notes;
-- DROP POLICY IF EXISTS books_user_isolation ON books;
-- ALTER TABLE book_notes DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE books DISABLE ROW LEVEL SECURITY;