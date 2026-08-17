# 002 · DB Schema Books & Notes — Plan

**Estado:** borrador

## Enfoque

Se creará una única migración SQL numerada (`supabase/migrations/002_books_notes.sql`) que defina de forma atómica el enum `book_status`, las tablas `books` y `book_notes` con todas sus columnas, constraints, índices, FK y el trigger `set_updated_at` sobre `books`. La migración será **idempotente** (usa `IF NOT EXISTS` donde aplica) y contendrá su correspondiente bloque `DOWN` para reversión completa. Esto respeta la convención del proyecto: **una migración por feature base**, sin tocar migraciones previas (Regla: "No tocar supabase/migrations/ después de aplicadas").

Orden lógico dentro de la migración:
1. `CREATE TYPE book_status AS ENUM (...)`
2. `CREATE TABLE books (...)` con PK, FK a `auth.users`, constraints `CHECK`, `UNIQUE`, default y timestamps.
3. `CREATE TABLE book_notes (...)` con PK, FK a `auth.users`, FK a `books` (`ON DELETE CASCADE`), columna `embedding vector(768)`, timestamps.
4. Función `set_updated_at()` + `CREATE TRIGGER` sobre `books`.
5. Índices de apoyo (FK `user_id` en ambas tablas, FK `book_id` en `book_notes`) para rendimiento de RLS futuro.

Validación: se aplicará la migración contra una instancia Supabase local (`supabase db reset` o `supabase migration up`) y se verificará con `psql` o script pytest que el esquema coincide con `tech-stack.md` (columnas, tipos, constraints, enum, trigger).

## Implementación

| Paso | Acción | Archivos / Módulos afectados |
|------|--------|------------------------------|
| 1 | Crear archivo de migración SQL `supabase/migrations/002_books_notes.sql` con todo el DDL (UP + DOWN). | `supabase/migrations/002_books_notes.sql` |
| 2 | Aplicar migración en entorno local: `supabase db reset` (o `supabase migration up` si ya hay DB). | Terminal / Supabase CLI |
| 3 | Verificar esquema resultante con consulta a `information_schema.columns`, `pg_enum`, `pg_trigger` y constraints. | Script de verificación (SQL o pytest) |
| 4 | Ejecutar suite de tests de backend para confirmar que no rompe nada (`cd apps/api && pytest -v`). | `apps/api/` |
| 5 | Documentar en `CHANGELOG.md` o notas de release la migración aplicada. | `CHANGELOG.md` (opcional) |

**Contenido clave de `002_books_notes.sql` (esqueleto):**

```sql
-- 002_books_notes.sql
-- UP
CREATE TYPE book_status AS ENUM ('want_to_read', 'reading', 'read');

CREATE TABLE books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  isbn13 char(13) UNIQUE,
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
  updated_at timestamptz NOT NULL DEFAULT now()
);

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

-- Trigger updated_at
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

-- Índices de apoyo para RLS y joins
CREATE INDEX idx_books_user_id ON books(user_id);
CREATE INDEX idx_book_notes_user_id ON book_notes(user_id);
CREATE INDEX idx_book_notes_book_id ON book_notes(book_id);

-- DOWN (reversión completa)
DROP TRIGGER IF EXISTS trigger_set_updated_at_books ON books;
DROP FUNCTION IF EXISTS set_updated_at();
DROP TABLE IF EXISTS book_notes;
DROP TABLE IF EXISTS books;
DROP TYPE IF EXISTS book_status;
```

> **Nota**: El `CHECK` de `isbn13` (formato 13 dígitos) se añade como constraint adicional:  
> `CONSTRAINT books_isbn13_format CHECK (isbn13 ~ '^\d{13}$')` — se incluirá en la tabla `books` final.

## Decisiones

| Decisión | Justificación | Alternativa descartada |
|----------|---------------|------------------------|
| **Una sola migración (002) para enum + 2 tablas + trigger** | Cambios atómicos y relacionados; evita dependencias entre migraciones parciales. | Dividir en 002_enum, 003_books, 004_notes, 005_trigger — añade complejidad sin beneficio. |
| `isbn13` como `char(13)` + `UNIQUE` por `user_id` + `CHECK` regex | Coincide exactamente con `tech-stack.md`; `UNIQUE` compuesto `(user_id, isbn13)` permite mismo ISBN para usuarios distintos. | `isbn13` global UNIQUE — impediría que dos usuarios tengan el mismo libro. |
| `book_notes.embedding vector(768) NOT NULL` | Requerido por `tech-stack.md` (modelo fijo `text-embedding-004`); pgvector necesita dimensión conocida. | `vector` sin dimensión — no permite índices HNSW futuros. |
| Trigger `set_updated_at` genérico reutilizable | Función única sirve para cualquier tabla con columna `updated_at`; convención Postgres estándar. | Trigger inline por tabla — duplicación de código. |
| Índices en `user_id` y `book_id` ahora (antes de RLS) | RLS policies filtran por `user_id`; joins por `book_id` son frecuentes. Índices tempranos evitan reescritura luego. | Crear índices en feature 004 (RLS) — funciona pero retrasa optimización. |
| `ON DELETE CASCADE` en FK `book_notes.book_id → books` | Borrar un libro elimina sus notas automáticamente; coherente con dominio (notas sin libro no tienen sentido). | `SET NULL` — dejaría notas huérfanas sin referencia útil. |

## Riesgos

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| **Migración falla en `supabase db reset` por conflicto con migración 001 existente** | Bloquea feature; requiere inspección manual. | Verificar contenido de `001_init.sql` antes de escribir 002; usar `IF NOT EXISTS` en `CREATE TYPE` y `CREATE TABLE`. |
| **Extensión `pgvector` no habilitada en la DB destino** | `CREATE TABLE book_notes` falla al referenciar tipo `vector`. | Asegurar que `001_init.sql` (o migración base) incluya `CREATE EXTENSION IF NOT EXISTS vector;` — si no, añadirlo en 002 antes de `book_notes`. |
| **Constraint `isbn13` UNIQUE compuesto no respeta `user_id` si se define mal** | Datos inconsistentes; dos usuarios no podrían compartir ISBN. | Definir `UNIQUE (user_id, isbn13)` explícitamente; probar con inserts de prueba multi-usuario. |
| **Trigger `updated_at` no dispara en `UPDATE` masivos o `ON CONFLICT`** | `updated_at` se desincroniza. | Probar trigger con `UPDATE books SET ...`, `INSERT ... ON CONFLICT DO UPDATE`, y `MERGE` si aplica. |
| **Reversión (DOWN) no limpia correctamente en entorno con datos** | `DROP TABLE` falla por FK vivas o datos. | `DOWN` usa `DROP TABLE ... CASCADE` implícito al borrar en orden inverso (`book_notes` antes que `books`); probar `supabase migration down` en DB con datos. |
| **Drift entre `tech-stack.md` y migración real** | Criterios de aceptación no cubiertos. | Checklist final comparando cada fila de las tablas en `tech-stack.md` contra `information_schema` post-migración. |