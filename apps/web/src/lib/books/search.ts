// Criterio de búsqueda de libros (feature 028).
//
// Espejo de `GET /api/v1/books` (feature 009): `q` busca por TÍTULO o AUTOR,
// case-insensitive y como substring. El API resuelve el título con `ilike` en
// Postgres y el autor en Python (PostgREST no soporta `ilike` sobre `text[]`);
// esta utilidad reproduce el mismo criterio para que el seed SSR del dashboard
// devuelva exactamente los mismos resultados que la llamada de cliente.

/** `true` si el libro coincide con `q` por título o por alguno de sus autores. */
export function matchesBookQuery(
  title: string,
  authors: readonly string[],
  q: string,
): boolean {
  const qLower = q.toLowerCase();
  if ((title ?? "").toLowerCase().includes(qLower)) {
    return true;
  }
  return (authors ?? []).some((author) =>
    (author ?? "").toLowerCase().includes(qLower),
  );
}
