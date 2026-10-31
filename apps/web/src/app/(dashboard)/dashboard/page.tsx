import type { Metadata } from "next";

import { LibraryGrid } from "@/components/dashboard/LibraryGrid";
import { getInitialBooks } from "@/lib/books/seed";
import { parseFilters } from "@/lib/books/filters";

export const metadata: Metadata = {
  title: "Mi Biblioteca | Bookshelf",
};

interface DashboardPageProps {
  searchParams?: Record<string, string | string[] | undefined>;
}

/** Convierte el `searchParams` de Next (objeto plano) a `URLSearchParams`. */
function toSearchParams(
  searchParams: DashboardPageProps["searchParams"],
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (typeof value === "string") {
      params.set(key, value);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        params.append(key, item);
      }
    }
  }
  return params;
}

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  // La URL es la fuente de verdad de los filtros (feature 030): se parsean los
  // mismos parámetros para el seed SSR y para el estado cliente de LibraryGrid,
  // de modo que refrescar/compartir/bookmarkear preserve el estado del dashboard.
  const initialFilters = parseFilters(toSearchParams(searchParams));
  const { books, total } = await getInitialBooks(initialFilters);

  return (
    <LibraryGrid
      initialBooks={books}
      initialTotal={total}
      initialFilters={initialFilters}
    />
  );
}
