import type { SupabaseClient } from "@supabase/supabase-js";

import { matchesBookQuery } from "@/lib/books/search";
import { createServerClient } from "@/lib/supabase/server";
import type { Book, BookFilters } from "@/types/book";

// Seed SSR del dashboard (feature 028). Solo servidor: usa `createServerClient`
// (cookies de auth via `next/headers`). Extraído de `page.tsx` para no exportar
// helpers que Next interpreta como "Page export fields" inválidos.

export const DASHBOARD_PAGE_SIZE = 20;

export interface InitialBooks {
  books: Book[];
  total: number;
}

type BookRow = Omit<Book, "notes_count"> & {
  book_notes?: Array<{ count: number }>;
};

/** Convierte fila de Supabase (con agregado `book_notes(count)`) a `Book`. */
function mapBookRow(row: BookRow): Book {
  const notesCount = row.book_notes?.[0]?.count ?? 0;
  const { book_notes: _bookNotes, ...book } = row;
  return { ...book, notes_count: notesCount };
}

/**
 * IDs de libros cuyo título (ILIKE en DB) o algún autor (JS) coincide con `q`.
 * Mismo criterio que `GET /api/v1/books` (feature 009): el autor se resuelve en
 * JS porque PostgREST no soporta `ilike` sobre columnas `text[]`.
 */
export async function findMatchingIds(
  supabase: SupabaseClient,
  userId: string,
  q: string,
): Promise<string[]> {
  const titleRes = await supabase
    .from("books")
    .select("id")
    .eq("user_id", userId)
    .ilike("title", `%${q}%`);
  const titleIds = (titleRes.data ?? []).map((row: { id: string }) => row.id);

  const authorRes = await supabase
    .from("books")
    .select("id, authors")
    .eq("user_id", userId);
  const authorIds = (authorRes.data ?? [])
    .filter((row: { id: string; authors: string[] }) =>
      matchesBookQuery("", row.authors, q),
    )
    .map((row: { id: string; authors: string[] }) => row.id);

  return [...new Set([...titleIds, ...authorIds])];
}

/**
 * Fetch inicial del dashboard (Server Component, feature 013):
 * - `createServerClient()` + `supabase.auth.getUser()` (server).
 * - Primera página de libros del usuario con filtros (status/rating sin
 *   filtrar, `q` vacío) vía `range(0, 19)`.
 * - Cuando hay `q`, filtra por título Y autor (mismo criterio que el API,
 *   feature 028), no solo por título.
 * - Devuelve seed para `LibraryGrid` (Client).
 */
export async function getInitialBooks(
  filters: BookFilters,
): Promise<InitialBooks> {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { books: [], total: 0 };
  }

  let query = supabase
    .from("books")
    .select("*, book_notes(count)", { count: "exact" })
    .eq("user_id", user.id);

  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.rating_min) {
    query = query.gte("rating", filters.rating_min);
  }
  if (filters.q) {
    const matchedIds = await findMatchingIds(supabase, user.id, filters.q);
    if (matchedIds.length === 0) {
      return { books: [], total: 0 };
    }
    query = query.in("id", matchedIds);
  }

  const { data, count, error } = await query.range(0, DASHBOARD_PAGE_SIZE - 1);

  if (error || !data) {
    return { books: [], total: 0 };
  }

  return {
    books: data.map(mapBookRow),
    total: count ?? 0,
  };
}
