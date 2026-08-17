# 001 · Supabase Setup

**Estado:** hecho

## Qué hace

Crea y configura el proyecto Supabase que servirá como backend completo: base de datos PostgreSQL con pgvector, autenticación (Google OAuth + Email/Password), y almacenamiento de credenciales para consumo por el backend FastAPI y el frontend Next.js.

Entregables:
- Proyecto Supabase creado en la organización/equipo correspondiente.
- Autenticación habilitada: proveedor Google (OAuth 2.0) y Email/Password.
- Extensión `pgvector` habilitada en la base de datos.
- Credenciales obtenidas: `Project URL`, `anon key` (pública), `service_role key` (privada, solo backend/MCP).
- Archivo `.env.example` en la raíz del repo con todas las variables necesarias documentadas.

## Por qué

Supabase es la columna vertebral de la infraestructura: provee DB, Auth, Realtime y vector search en un solo servicio gestionado. Configurarlo primero desbloquea todo el desarrollo posterior (migraciones, RLS, RPC, clientes). El `.env.example` asegura onboarding rápido y consistencia entre entornos.

## Criterios de aceptación

- [ ] Proyecto Supabase accesible vía dashboard y API.
- [ ] Auth: Google OAuth funcional (callback configurado), Email/Password habilitado.
- [ ] `pgvector` extension instalada y verificada (`SELECT * FROM pg_extension WHERE extname = 'vector';`).
- [ ] Credenciales (URL, anon key, service_role key) funcionan al conectar con `supabase-js` y `supabase-py`.
- [ ] `.env.example` existe en raíz con: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET` (opcional, para verificación local), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
- [ ] Documentado en README (o docs/) cómo crear proyecto local y vincular a Supabase CLI.

## Fuera de alcance

- Migraciones de esquema (feature 002).
- Políticas RLS (feature 004).
- RPC `match_book_notes` (feature 005).
- Configuración de dominios personalizados / SMTP / proveedores OAuth adicionales.