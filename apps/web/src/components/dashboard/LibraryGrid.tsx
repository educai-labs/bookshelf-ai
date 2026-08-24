"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { useBooks } from "@/lib/hooks/useBooks";
import type { Book, BookFilters } from "@/types/book";
import { BookCard } from "./BookCard";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import { LoadMoreButton } from "./LoadMoreButton";
import {
  RatingFilterSelect,
  type RatingFilterValue,
} from "./RatingFilterSelect";
import { SearchInput } from "./SearchInput";
import { StatusFilterTabs, type StatusFilterValue } from "./StatusFilterTabs";

export interface LibraryGridProps {
  /** Seed del Server Component (primer render + refresco silencioso). */
  initialBooks: Book[];
  initialTotal: number;
  initialFilters?: BookFilters;
}

const DEFAULT_FILTERS: BookFilters = { q: "" };

/** Skeleton del primer fetch: grid de 8 cards (espejo del grid real). */
function BooksSkeleton() {
  return (
    <div
      className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      data-testid="books-skeleton"
      aria-label="Cargando libros"
    >
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} className="aspect-[2/3] w-full rounded-xl" />
      ))}
    </div>
  );
}

/**
 * Grid principal del dashboard (feature 013):
 * - Estado interno de `filters` (status, rating, q) con merge del seed.
 * - Data engine en `useBooks` (debounce 300ms de `q`, reset+fetch en cambio
 *   de filtros, paginación "Cargar más" con append).
 * - Header sticky con filtros; grid responsive `1/2/3/4` cols (`sm/lg/xl`).
 * - Estados: Skeleton (primer fetch), EmptyState (sin resultados), ErrorState.
 */
export function LibraryGrid({
  initialBooks,
  initialTotal,
  initialFilters,
}: LibraryGridProps) {
  const router = useRouter();
  const [filters, setFilters] = useState<BookFilters>({
    ...DEFAULT_FILTERS,
    ...initialFilters,
  });

  const {
    books,
    total,
    isLoading,
    isLoadingMore,
    error,
    hasMore,
    loadMore,
    retry,
  } = useBooks(filters, { initialBooks, initialTotal });

  function handleStatusChange(value: StatusFilterValue) {
    setFilters((prev) => ({
      ...prev,
      status: value === "all" ? undefined : value,
    }));
  }

  function handleRatingChange(value: RatingFilterValue) {
    setFilters((prev) => ({
      ...prev,
      rating_min: value === "all" ? undefined : value,
    }));
  }

  function handleSearchChange(q: string) {
    setFilters((prev) => ({ ...prev, q }));
  }

  const showSkeleton = isLoading && books.length === 0;

  return (
    <div>
      <header className="sticky top-16 z-10 border-b bg-background/95 p-4 backdrop-blur">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <StatusFilterTabs
            value={filters.status ?? "all"}
            onChange={handleStatusChange}
          />
          <RatingFilterSelect
            value={filters.rating_min ?? "all"}
            onChange={handleRatingChange}
          />
          <div className="lg:ml-auto lg:w-72">
            <SearchInput
              value={filters.q ?? ""}
              onChange={handleSearchChange}
            />
          </div>
        </div>
      </header>

      {error ? (
        <ErrorState message={error.message} onRetry={() => void retry()} />
      ) : showSkeleton ? (
        <BooksSkeleton />
      ) : books.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <div
            className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            data-testid="books-grid"
          >
            {books.map((book) => (
              <BookCard
                key={book.id}
                book={book}
                onClick={() => router.push(`/book/${book.id}`)}
              />
            ))}
          </div>
          {hasMore && (
            <div className="mt-8">
              <LoadMoreButton
                onClick={() => void loadMore()}
                isLoadingMore={isLoadingMore}
                hasMore={hasMore}
              />
            </div>
          )}
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {total} {total === 1 ? "libro" : "libros"}
          </p>
        </>
      )}
    </div>
  );
}
