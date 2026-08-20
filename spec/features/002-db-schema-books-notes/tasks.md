---
feature: "002-db-schema-books-notes"
estado: "en curso"
---

# Tasks — 002 DB Schema Books & Notes

## Migración SQL: Creación

- [x] **Tarea 1:** Crear archivo `supabase/migrations/002_books_notes.sql` con el bloque `UP` completo:
    - Definir enum `book_status AS ENUM ('want_to_read', 'reading', 'read')` usando `CREATE TYPE IF NOT EXISTS`.
    - Crear tabla `books` con:
      - `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
      - `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`
      - `isbn13 char(13) UNIQUE` con constraint de formato `CONSTRAINT books_isbn13_format CHECK (isbn13 ~ '^\d{13}$')`
      - `title text NOT NULL`
      - `authors text[] NOT NULL DEFAULT '{}'`
      - `cover_url text`
      - `page_count int CHECK (page_count > 0)`
      - `publisher text`
      - `published_date date`
      - `description text`
      - `status book_status NOT NULL DEFAULT 'want_to_read'`
      - `rating smallint CHECK (rating BETWEEN 1 AND 5)`
      - `started_at date`
      - `finished_at date`
      - `created_at timestamptz NOT NULL DEFAULT now()`
      - `updated_at timestamptz NOT NULL DEFAULT now()`
    - Crear tabla `book_notes` con:
      - `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
      - `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`
      - `book_id uuid NOT NULL REFERENCES books(id) ON DELETE CASCADE`
      - `content text NOT NULL`
      - `content_html text NOT NULL`
      - `chunk_index int NOT NULL`
      - `embedding vector(768) NOT NULL`
      - `created_at timestamptz NOT NULL DEFAULT now()`
    - Crear trigger `set_updated_at` sobre `books` (función + trigger `BEFORE UPDATE`).
    - Crear índices de apoyo: `idx_books_user_id`, `idx_book_notes_user_id`, `idx_book_notes_book_id`.
    - Bloque `DOWN` con `DROP TRIGGER`, `DROP FUNCTION`, `DROP TABLE book_notes`, `DROP TABLE books`, `DROP TYPE book_status` (en orden inverso).

- [x] **Tarea 2:** Verificar que el archivo `002_books_notes.sql` incluye el `CREATE EXTENSION IF NOT EXISTS vector;` antes de crear la tabla `book_notes` (asegurar que pgvector esté disponible).

## Migración SQL: Aplicación

- [x] **Tarea 3:** Aplicar migración en entorno local:
    - Ejecutar `supabase db reset` para iniciar DB limpia y aplicar la migración 002 atómica.
    - **Alternativa:** Si la DB ya existe, ejecutar `supabase migration up` para aplicar solo la pendiente 002.

- [x] **Tarea 4:** Confirmar que la extensión `vector` está habilitada:
    - Ejecutar `SELECT * FROM pg_extension WHERE extname = 'vector';` y verificar que aparece fila con `extversion >= '0.7'`.
    - Si no está, ejecutar `CREATE EXTENSION IF NOT EXISTS vector;` manualmente antes de la migración.

## Validación del Esquema

- [x] **Tarea 5:** Verificar estructura de la tabla `books` contra `tech-stack.md`:
    - Consultar `information_schema.columns` para `books` y comprobar:
      - Columnas esperadas con tipos correctos (uuid, text, text[], smallint, timestamptz, etc.)
      - `PRIMARY KEY` en `id`
      - `FK` `user_id → auth.users(id) ON DELETE CASCADE`
      - `UNIQUE` en `isbn13` (compuesto con `user_id` si aplica, o global)
      - `CHECK page_count > 0`, `CHECK rating BETWEEN 1 AND 5`
      - `DEFAULT now()` en `created_at` y `updated_at`
      - Columna `status` tipo enum `book_status`
    - Consultar `pg_enum` para confirmar que `book_status` tiene exactamente 3 valores: `want_to_read`, `reading`, `read`.

- [x] **Tarea 6:** Verificar estructura de la tabla `book_notes` contra `tech-stack.md`:
    - Consultar `information_schema.columns` para `book_notes` y comprobar:
      - Columnas esperadas: `id`, `user_id`, `book_id`, `content`, `content_html`, `chunk_index`, `embedding`, `created_at`
      - Tipos: uuid, uuid (FK), text, text, int, vector(768), timestamptz
      - `FK book_id → books(id) ON DELETE CASCADE`
      - `embedding vector(768) NOT NULL`

- [x] **Tarea 7:** Verificar trigger `set_updated_at`:
    - Ejecutar `UPDATE books SET title = title WHERE id = '<uuid>';` en una fila existente.
    - Verificar que `updated_at` se actualiza a `now()` automaticamente.
    - Consultar `pg_trigger` para confirmar que `trigger_name = 'trigger_set_updated_at_books'` existe y su función es `set_updated_at`.

- [x] **Tarea 8:** Verificar índices de apoyo:
    - Confirmar índices `idx_books_user_id`, `idx_book_notes_user_id`, `idx_book_notes_book_id` existen en `pg_indexes`.
    - Ejecutar `EXPLAIN SELECT ... FROM books WHERE user_id = '<uuid>';` y `FROM book_notes WHERE book_id = '<uuid>';` para validar uso de índices.

## Pruebas de Integración

- [x] **Tarea 9:** Ejecutar suite de tests de backend para confirmar que la migración no rompe nada:
    - `cd apps/api && pytest -v` (o el comando de test definido en `tech-stack.md`).
    - Verificar que todos los tests pasan (exit code 0).
    - Anotar cualquier test fallido y correlacionar con cambios en el esquema.

- [x] **Tarea 10:** Ejecutar validación rápida de inserción y constraints:
    - Insertar un libro con datos inválidos (ej. `isbn13` con menos de 13 dígitos) y confirmar que el `CHECK` rechaza el insert.
    - Insertar un libro con `rating` fuera de rango 1-5 y confirmar el `CHECK` lo rechaza.
    - Insertar un `book_note` con `embedding` de dimensión distinta a 768 y confirmar el error.
    - Insertar un libro sin `title` y confirmar el `NOT NULL` constraint.

## Documentación

- [x] **Tarea 11:** Añadir entrada al `CHANGELOG.md` (o `docs/release-notes.md`) para la migración 002:
    - Formato: `- **002**: DB Schema Books & Notes — migración `002_books_notes.sql` aplicada. Tabla `books` y `book_notes` creadas con constraints, enum `book_status`, trigger `updated_at` e índices de apoyo.`
    - Verificar que la entrada coincide con la convención del changelog existente.

- [x] **Tarea 12:** Documentar en `docs/supabase-setup.md` (o sección correspondiente) los pasos para reproducir la migración 002 en un proyecto nuevo:
    - Ejecutar `supabase migration up` o `supabase db reset`.
    - Verificar que `pgvector` está habilitado.
    - Confirmar que los enum y triggers están activos.

---
**Estado: `hecho`** — Implementación completada: 12/12 tareas `[x]`. Migración 002 aplicada y validada en entorno remoto (proyecto linkado `xtjvwlmwdjpsblqrghno`). Pendiente revisión del revisor.