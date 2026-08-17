# Changelog

Todos los cambios notables del proyecto se documentan en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es/1.1.0/) y este proyecto
usa [Semantic Versioning](https://semver.org/lang/es/).

## [Unreleased]

### Añadido

- **001**: Supabase Setup — extensión `pgvector` habilitada (migración `20260815185301_enable_pgvector.sql`), credenciales documentadas en `docs/supabase-setup.md`, scripts de verificación `verify:supabase`.
- **002**: DB Schema Books & Notes — migración `002_books_notes.sql` aplicada. Tabla `books` y `book_notes` creadas con constraints, enum `book_status`, trigger `updated_at` e índices de apoyo.