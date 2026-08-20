# 004 · RLS Policies

**Estado:** hecho

## Qué hace

Habilita Row Level Security (RLS) en las tablas `books` y `book_notes` y define políticas `ALL` que restringen el acceso a filas donde `auth.uid() = user_id`. Esto garantiza aislamiento total por usuario a nivel de base de datos, sin depender de lógica de aplicación.

## Por qué

RLS es la única defensa infranqueable contra fugas de datos entre usuarios. Aunque el backend filtre por `user_id`, un bug en el código o un ataque de inyección SQL no puede saltarse la política a nivel de engine. Supabase Auth provee `auth.uid()` automáticamente validado desde el JWT.

## Criterios de aceptación

- [ ] Migración `003_rls_policies.sql` ejecuta:
  - `ALTER TABLE books ENABLE ROW LEVEL SECURITY;`
  - `ALTER TABLE book_notes ENABLE ROW LEVEL SECURITY;`
  - Policy `books_user_isolation`: `CREATE POLICY books_user_isolation ON books FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);`
  - Policy `book_notes_user_isolation`: `CREATE POLICY book_notes_user_isolation ON book_notes FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);`
- [ ] Verificación manual: con dos usuarios (A y B), insertar libros/notas como A; consultar con token de B → 0 filas. Consultar con token de A → filas propias.
- [ ] Políticas cubren `SELECT`, `INSERT`, `UPDATE`, `DELETE` (cláusula `ALL`).
- [ ] No hay políticas `PUBLIC` ni `ANON` que filtren datos.
- [ ] `service_role` key (backend/MCP) bypassea RLS automáticamente (comportamiento nativo Supabase).

## Fuera de alcance

- Políticas granulares por acción (ej. solo dueño puede borrar, pero todos pueden ver) — no aplica, datos son privados.
- RLS en tablas de sistema / auth (gestión Supabase).
- Auditoría / logging de accesos (feature futura si se necesita compliance).