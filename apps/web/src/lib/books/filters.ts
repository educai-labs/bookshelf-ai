// Serialización, validación y normalización de los filtros del dashboard
// (feature 030 · Z1-06).
//
// La URL es la fuente de verdad de los tres filtros (búsqueda `q`, estado
// `status` y valoración `rating`). Estas utilidades se comparten entre:
// - el Server Component (`page.tsx`), que parsea `searchParams` para el seed, y
// - `LibraryGrid` (cliente), que serializa/normaliza al escribir la URL y
//   rehidrata al reaccionar a cambios de `useSearchParams`.
//
// Reglas:
// - Los valores por defecto se OMITEN (q vacío, sin status, sin rating) para
//   que una primera visita no cargue query params innecesarios.
// - Los valores inválidos o parámetros desconocidos se DESCARTAN sin lanzar.

import type { BookFilters, BookStatus } from "@/types/book";

/** Estados válidos (enum DB `book_status`). */
const BOOK_STATUSES: readonly BookStatus[] = [
  "want_to_read",
  "reading",
  "read",
];

/** Filtros por defecto del dashboard (primera visita sin query params). */
export const DEFAULT_BOOK_FILTERS: BookFilters = { q: "" };

/** Guard de tipo para `BookStatus`. */
function isBookStatus(value: string | null): value is BookStatus {
  return value !== null && (BOOK_STATUSES as readonly string[]).includes(value);
}

/** Normaliza `rating` (string → int 1-5). Devuelve `undefined` si es inválido. */
function normalizeRating(value: string | null): number | undefined {
  if (value === null || value === "") return undefined;
  const rating = Number(value);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return undefined;
  }
  return rating;
}

/**
 * Parsea query params (`?q=...&status=...&rating=...`) a `BookFilters`.
 * Descarta parámetros inválidos o desconocidos y vuelve a los defaults sin
 * lanzar excepciones.
 */
export function parseFilters(params: URLSearchParams): BookFilters {
  const filters: BookFilters = { ...DEFAULT_BOOK_FILTERS };

  const q = params.get("q");
  if (q !== null) {
    const trimmed = q.trim();
    if (trimmed !== "") {
      filters.q = trimmed;
    }
  }

  const status = params.get("status");
  if (isBookStatus(status)) {
    filters.status = status;
  }

  const rating = normalizeRating(params.get("rating"));
  if (rating !== undefined) {
    filters.rating_min = rating;
  }

  return filters;
}

/**
 * Serializa `BookFilters` a query params, omitiendo defaults e inválidos.
 * `rating_min` (1-5) se escribe como `rating` para mantener la paridad con el
 * contrato de `GET /api/v1/books` y la query del dashboard.
 */
export function serializeFilters(filters: BookFilters): URLSearchParams {
  const params = new URLSearchParams();

  const q = filters.q?.trim();
  if (q) {
    params.set("q", q);
  }

  if (filters.status && isBookStatus(filters.status)) {
    params.set("status", filters.status);
  }

  const rating = filters.rating_min;
  if (
    rating !== undefined &&
    rating !== null &&
    Number.isInteger(rating) &&
    rating >= 1 &&
    rating <= 5
  ) {
    params.set("rating", String(rating));
  }

  return params;
}
