import type { Metadata } from "next";

import { LibraryGrid } from "@/components/dashboard/LibraryGrid";
import { getInitialBooks } from "@/lib/books/seed";
import type { BookFilters } from "@/types/book";

export const metadata: Metadata = {
  title: "Mi Biblioteca | Bookshelf",
};

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
