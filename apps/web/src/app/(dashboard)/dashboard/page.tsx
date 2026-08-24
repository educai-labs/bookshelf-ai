import type { Metadata } from "next";

import { LibraryGrid } from "@/components/dashboard/LibraryGrid";
import { createServerClient } from "@/lib/supabase/server";
import type { Book, BookFilters } from "@/types/book";

export const metadata: Metadata = {
  title: "Mi Biblioteca | Bookshelf",
};

const PAGE_SIZE = 20;

interface InitialBooks {
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
 * Fetch inicial del dashboard (Server Component, feature 013):
 * - `createServerClient()` + `supabase.auth.getUser()` (server).
 * - Primera página de libros del usuario con filtros default
 *   (status/rating sin filtrar, `q` vacío) vía `range(0, 19)`.
 * - Devuelve seed para `LibraryGrid` (Client).
 */
async function getInitialBooks(filters: BookFilters): Promise<InitialBooks> {
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
    query = query.ilike("title", `%${filters.q}%`);
  }

  const { data, count, error } = await query.range(0, PAGE_SIZE - 1);

  if (error || !data) {
    return { books: [], total: 0 };
  }

  return {
    books: data.map(mapBookRow),
    total: count ?? 0,
  };
}

export default async function DashboardPage() {
  const defaultFilters: BookFilters = { q: "" };
  const { books, total } = await getInitialBooks(defaultFilters);

  return (
    <LibraryGrid
      initialBooks={books}
      initialTotal={total}
      initialFilters={defaultFilters}
    />
  );
}
