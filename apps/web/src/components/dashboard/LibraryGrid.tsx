"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAddBookModal } from "@/components/books/AddBookModalProvider";
import { ApiError } from "@/lib/api/books";
import { useBooks } from "@/lib/hooks/useBooks";
import {
  DEFAULT_BOOK_FILTERS,
  parseFilters,
  serializeFilters,
} from "@/lib/books/filters";
import type { Book, BookFilters, BookSuggestion } from "@/types/book";
import { useTranslation } from "@/lib/i18n";
import { pluralize } from "@/lib/formatters";
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

/** Skeleton del primer fetch: grid de 8 cards (espejo del grid real). */
function BooksSkeleton({ label }: { label: string }) {
  return (
    <div
      className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      data-testid="books-skeleton"
      aria-label={label}
    >
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} className="aspect-[2/3] w-full rounded-xl" />
      ))}
    </div>
  );
}

/**
 * Grid principal del dashboard (features 013 + 023 + 030):
 * - Estado de `filters` (status, rating, q) con merge del seed.
 * - La URL es la fuente de verdad: los cambios se escriben con navegación
 *   cliente (`router.push`) y los cambios externos de `useSearchParams`
 *   (atrás/adelante, enlace compartido, refresh) rehidratan los filtros.
 * - Data engine en `useBooks` (debounce 300ms de `q`, reset+fetch en cambio
 *   de filtros, paginación "Cargar más" con append).
 * - Buscador combinado (`SearchInput`) con sugerencias en vivo: seleccionar una
 *   de biblioteca navega a `/book/[id]`; una de catálogo abre `AddBookModal`
 *   con el ISBN precargado.
 * - Header sticky con filtros; grid responsive `1/2/3/4` cols (`sm/lg/xl`).
 * - Estados: Skeleton (primer fetch), EmptyState (sin resultados), ErrorState.
 */
export function LibraryGrid({
  initialBooks,
  initialTotal,
  initialFilters,
}: LibraryGridProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t, language } = useTranslation();
  const { openAddBook } = useAddBookModal();

  const [filters, setFilters] = useState<BookFilters>(() => ({
    ...DEFAULT_BOOK_FILTERS,
    ...initialFilters,
  }));

  // La URL es fuente de verdad para cambios EXTERNOS (atrás/adelante, o
  // navegación a la misma ruta con otros params). `syncedQueryRef` registra la
  // query ya sincronizada para no rehidratar en el montaje (donde
  // `initialFilters` ya refleja la URL) ni reintroducir valores cuando la
  // escribimos nosotros mismos. `parseFilters` descarta valores inválidos y
  // conserva los defaults.
  const syncedQueryRef = useRef(searchParams.toString());

  useEffect(() => {
    const currentQuery = searchParams.toString();
    if (currentQuery === syncedQueryRef.current) return;
    syncedQueryRef.current = currentQuery;
    setFilters(parseFilters(searchParams));
  }, [searchParams]);

  const {
    books,
    total,
    isLoading,
    isLoadingMore,
    error,
    loadMoreError,
    hasMore,
    loadMore,
    retry,
    retryLoadMore,
  } = useBooks(filters, { initialBooks, initialTotal });

  // Sesión caducada (401) en la primera carga: redirige a login preservando la
  // ruta + query actuales como `redirectTo` (el middleware los respeta al
  // volver). Los errores 5xx siguen mostrando `ErrorState` con retry.
  const isUnauthorized = error instanceof ApiError && error.status === 401;

  useEffect(() => {
    if (!isUnauthorized) return;
    const query = searchParams.toString();
    const current = query ? `${pathname}?${query}` : pathname;
    router.replace(`/login?redirectTo=${encodeURIComponent(current)}`);
  }, [isUnauthorized, pathname, searchParams, router]);

  // Aplica un cambio de filtros: actualiza el estado y escribe la URL
  // normalizada con navegación cliente (sin recarga dura), evitando
  // navegaciones redundantes cuando la query resultante no cambia.
  function applyFilters(next: BookFilters) {
    setFilters(next);
    const nextQuery = serializeFilters(next).toString();
    if (nextQuery === searchParams.toString()) return;
    syncedQueryRef.current = nextQuery;
    router.push(nextQuery ? `${pathname}?${nextQuery}` : pathname, {
      scroll: false,
    });
  }

  function handleStatusChange(value: StatusFilterValue) {
    applyFilters({
      ...filters,
      status: value === "all" ? undefined : value,
    });
  }

  function handleRatingChange(value: RatingFilterValue) {
    applyFilters({
      ...filters,
      rating_min: value === "all" ? undefined : value,
    });
  }

  function handleSearchChange(q: string) {
    applyFilters({ ...filters, q });
  }

  function handleSelectSuggestion(item: BookSuggestion) {
    if (item.source === "library" && item.book_id) {
      router.push(`/book/${item.book_id}`);
    } else {
      openAddBook(item.isbn13);
    }
  }

  function handleSuggestionError() {
    toast.error(t("suggestions.errorToast"));
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
              onSelectSuggestion={handleSelectSuggestion}
              onSuggestionError={handleSuggestionError}
            />
          </div>
        </div>
      </header>

      {error ? (
        isUnauthorized ? null : (
          <ErrorState message={error.message} onRetry={() => void retry()} />
        )
      ) : showSkeleton ? (
        <BooksSkeleton label={t("dashboard.skeletonAria")} />
      ) : books.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <div
            className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            data-testid="books-grid"
          >
            {books.map((book) => (
              <BookCard key={book.id} book={book} />
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
          {loadMoreError && (
            <div className="mt-4" data-testid="load-more-error">
              <Alert variant="destructive">
                <AlertDescription>
                  {t("dashboard.loadMoreError")}
                </AlertDescription>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => void retryLoadMore()}
                  data-testid="retry-load-more"
                >
                  {t("common.retry")}
                </Button>
              </Alert>
            </div>
          )}
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {total}{" "}
            {pluralize(
              language,
              total,
              t("dashboard.booksCount.one"),
              t("dashboard.booksCount.many"),
            )}
          </p>
        </>
      )}
    </div>
  );
}
