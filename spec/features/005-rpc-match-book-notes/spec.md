# 005 · RPC match_book_notes

**Estado:** hecho

## Qué hace

Crea la función PL/pgSQL `match_book_notes` que ejecuta búsqueda semántica vectorial sobre `book_notes` filtrada por `user_id`, usando el índice HNSW. Retorna chunks con similitud coseno, unidos a `books` para obtener el título.

Firma:
```sql
match_book_notes(
  query_embedding vector(768),
  filter_user_id uuid,
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10
) RETURNS SETOF record (
  note_id uuid,
  book_id uuid,
  book_title text,
  chunk_index int,
  content text,
  similarity float
)
```

## Por qué

Encapsular la query vectorial en RPC tiene ventajas críticas:
- **Seguridad**: el `user_id` se valida dentro de la DB, no se confía en el cliente.
- **Rendimiento**: plan de ejecución fijo, usa índice HNSW, evita N+1 en aplicación.
- **Portabilidad**: MCP, backend y futuros clientes llaman a la misma función.
- **Threshold/limit configurables** sin cambiar código.

## Criterios de aceptación

- [ ] Migración `004_rpc_match_book_notes.sql` crea la función con:
  - Parámetros tipados: `query_embedding vector(768)`, `filter_user_id uuid`, `match_threshold float DEFAULT 0.7`, `match_count int DEFAULT 10`.
  - Query: `SELECT bn.id, bn.book_id, b.title, bn.chunk_index, bn.content, 1 - (bn.embedding <=> query_embedding) AS similarity FROM book_notes bn JOIN books b ON bn.book_id = b.id WHERE bn.user_id = filter_user_id AND 1 - (bn.embedding <=> query_embedding) > match_threshold ORDER BY bn.embedding <=> query_embedding LIMIT match_count;`
  - `SECURITY DEFINER` para ejecutar con permisos del creador (bypass RLS interno, pero `filter_user_id` lo filtra).
  - `SET search_path = public` para evitar inyección de search_path.
- [ ] Test manual: insertar notas con embeddings conocidos, llamar RPC con embedding similar → retorna chunks ordenados por similitud descendente, `similarity > 0.7`, máx 10 filas.
- [ ] RPC respeta `filter_user_id`: notas de usuario B no aparecen al consultar con `user_id` de A.
- [ ] `EXPLAIN` de la RPC muestra `Index Scan using idx_book_notes_embedding_hnsw`.
- [ ] Documentado en migración: propósito, parámetros, retorno, ejemplo de llamada.

## Fuera de alcance

- Creación del índice HNSW (feature 003).
- Endpoint API `/api/v1/ai/chat` que consume la RPC (feature 017).
- Tool MCP `chat_with_library` que consume la RPC (feature 019).
- Ajuste de threshold/limit por feature (se pasan como parámetros).