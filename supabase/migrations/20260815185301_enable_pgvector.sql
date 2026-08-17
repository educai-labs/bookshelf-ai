-- Feature 001 · Supabase Setup
-- Habilita la extensión pgvector (vector search) en la base de datos.
-- Requisito: PostgreSQL 16 (Supabase managed) + pgvector >= 0.7.
-- Aplicación: tras `supabase link --project-ref <PROJECT_REF>`, ejecutar `supabase db push`
-- (o ejecutar este SQL en Dashboard → SQL Editor).

CREATE EXTENSION IF NOT EXISTS vector;