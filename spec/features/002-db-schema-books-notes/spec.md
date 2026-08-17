# 002 · DB Schema Books & Notes

**Estado:** en curso

## Qué hace

Define las migraciones SQL y el esquema de base de datos para las tablas `books` y `book_notes`, incluyendo Primary Keys, Foreign Keys, enums, constraints de integridad, timestamps automáticos y triggers `updated_at`. Este esquema es la base sobre la que se construirán todas las features posteriores (CRUD, RLS, RPCs, vectorización, UI).

Específicamente incluye:

- Tabla `books` con todas sus columnas, tipos de datos, constraints y el enum `book_status`.
- Tabla `book_notes` con sus columnas, FK a `books`, embedding vectorial y timestamps.
- Trigger `set_updated_at` en la tabla `books` para actualizar `updated_at` en cada UPDATE.
- Migraciones SQL numeradas y versionadas seguando las convenciones del proyecto.

## Por qué

El esquema de base de datos es el cimiento sobre el que se construye toda la aplicación: CRUD de libros y notas, búsquedas semánticas con pgvector, RLS por usuario, y el chat IA con contexto de libro. Sin un esquema bien definido con los constraints y triggers adecuados, las features posteriores no podrían garantizar integridad de datos, consistencia referencial ni el correcto funcionamiento de búsquedas vectoriales. Configurar esto primero desbloquea el desarrollo rápido y evita refactoring costoso después.

Además, los principios de la misión marcan que los datos son del usuario (local-first, cloud-synced) y que la privacidad por defecto está asegurada mediante RLS; el esquema actualizado refleja esos principios desde la capa de DB.

## Criterios de aceptación

- [ ] Archivo de migración SQL `supabase/migrations/002_books_notes.sql` (o numerado siguiente al 001) existe y es válido.
- [ ] Tabla `books` tiene: PK `id` (uuid, `gen_random_uuid()`), FK `user_id` (uuid → `auth.users(id)`), `isbn13` UNIQUE por user_id con CHECK de formato, `title` NOT NULL, `authors` text[] NOT NULL, `status` enum `book_status` con valores `want_to_read | reading | read` y default `want_to_read`, `rating` CHECK `BETWEEN 1 AND 5`, `page_count` CHECK `> 0` cuando no nulo, y trigger `set_updated_at`.
- [ ] Tabla `book_notes` tiene: PK `id` (uuid, `gen_random_uuid()`), FK `user_id` (uuid → `auth.users(id)`), FK `book_id` (uuid → `books(id)` ON DELETE CASCADE), `content` text NOT NULL, `content_html` text NOT NULL, `chunk_index` int NOT NULL, `embedding` vector(768) NOT NULL, y timestamps `created_at`.
- [ ] Trigger `set_updated_at` está definido sobre la tabla `books` y actualiza `updated_at = now()` en cada operación UPDATE.
- [ ] Enum `book_status` existe con exactamente los tres valores: `want_to_read`, `reading`, `read`.
- [ ] Migraciones se pueden aplicar sin errores (`pytest` o `supabase` CLI verify o equivalente).
- [ ] Script de reversión (down) existe para cada migración (opcional pero recomendado según tech-stack.md).
- [ ] No hay columnas o constraints faltantes comparado con la especificación de `tech-stack.md` (tabla `books` y tabla `book_notes`).

## Fuera de alcance

- Políticas RLS sobre las tablas (feature 004).
- RPC `match_book_notes` (feature 005).
- Endpoints FastAPI o controladores que consuman este esquema (features 006 en adelante).
- UI de dashboard o modales para gestionar libros/notas (features 013 en adelante).
- Configuración de embeddings, chunking o integración con modelos de IA (features 016 en adelante).
- Migraciones o tables adicionales para features futuras no incluidas en este esquema base.

(Notas: si alguna de las items de "Fuera de scope" se necesita para desbloquear el trabajo actual, se documentará como dependencia en roadmap y no formará parte de los criterios de aceptación de esta feature.)