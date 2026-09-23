-- 006 · Account Preferences
-- Tabla `account_preferences` (una fila por usuario) con preferencias JSONB
-- agrupadas por lector/chat/notificaciones/privacidad, timestamps y
-- restricciones. RLS aísla lectura/escritura por `user_id`; un trigger aplica
-- los defaults a usuarios nuevos al crearse en `auth.users`.
--
-- Aplicación: `supabase db push` (proyecto linkado).
-- Requisito: `auth.users` existe (Supabase) y la función `set_updated_at`
-- (migración 002) ya está disponible.

-- ============================================================
-- UP
-- ============================================================

-- Defaults de preferencias (coinciden con `plan.md` §1 y con
-- `apps/web/src/lib/settings/defaults.ts`).
CREATE TABLE account_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  reader jsonb NOT NULL DEFAULT '{
    "fontSize": 16,
    "lineWidth": 720,
    "lineHeight": 1.6,
    "font": "system",
    "showBookDetails": true,
    "confirmDeletions": true
  }'::jsonb,
  chat jsonb NOT NULL DEFAULT '{
    "initialMode": "book",
    "showHistory": true,
    "clearHistoryOnLogout": true,
    "respondInInterfaceLanguage": true,
    "autoRecommendations": true
  }'::jsonb,
  notifications jsonb NOT NULL DEFAULT '{
    "errors": true,
    "vectorizationDone": true,
    "recommendations": true,
    "account": true
  }'::jsonb,
  privacy jsonb NOT NULL DEFAULT '{
    "useNotesForSearch": true
  }'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Restricciones de rangos/enums (validación server-side además de Pydantic).
  CONSTRAINT account_preferences_reader_ranges CHECK (
    jsonb_typeof(reader) = 'object'
    AND (reader->>'fontSize')::int BETWEEN 14 AND 22
    AND (reader->>'lineWidth')::int BETWEEN 480 AND 960
    AND (reader->>'lineHeight')::numeric BETWEEN 1.4 AND 2.0
    AND reader->>'font' IN ('system', 'serif', 'sans')
  ),
  CONSTRAINT account_preferences_chat_mode CHECK (
    jsonb_typeof(chat) = 'object'
    AND chat->>'initialMode' IN ('book', 'library')
  ),
  CONSTRAINT account_preferences_jsonb_objects CHECK (
    jsonb_typeof(notifications) = 'object'
    AND jsonb_typeof(privacy) = 'object'
  )
);

-- Trigger updated_at (reutiliza la función de la migración 002).
CREATE TRIGGER trigger_set_updated_at_account_preferences
BEFORE UPDATE ON account_preferences
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Índice de apoyo (user_id ya es UNIQUE, pero explícito por claridad).
CREATE INDEX idx_account_preferences_user_id ON account_preferences(user_id);

-- Defaults para usuarios nuevos: al crearse en `auth.users`, se inserta una
-- fila con los defaults de columna. `SECURITY DEFINER` para poder escribir en
-- `public.account_preferences` desde el trigger de `auth.users`.
CREATE OR REPLACE FUNCTION public.handle_new_user_preferences()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.account_preferences (user_id)
  VALUES (new.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_preferences();

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE account_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY account_preferences_user_isolation ON account_preferences
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- DOWN (referencia manual; Supabase ejecuta forward-only)
-- ============================================================
-- DROP POLICY IF EXISTS account_preferences_user_isolation ON account_preferences;
-- ALTER TABLE account_preferences DISABLE ROW LEVEL SECURITY;
-- DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
-- DROP FUNCTION IF EXISTS public.handle_new_user_preferences();
-- DROP TRIGGER IF EXISTS trigger_set_updated_at_account_preferences ON account_preferences;
-- DROP TABLE IF EXISTS account_preferences;
