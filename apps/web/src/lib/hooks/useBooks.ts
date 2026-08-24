"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useDebounce } from "@/lib/hooks/useDebounce";
import { supabase } from "@/lib/supabase/client";
import type { Book, BookFilters, PaginatedBooks } from "@/types/book";

export const DEFAULT_PAGE_SIZE = 20;
export const SEARCH_DEBOUNCE_MS = 300;

export interface UseBooksOptions {
  /** Tamaño de página (default 20). */
  pageSize?: number;
  /** Seed del Server Component (primer render, refresco silencioso). */
  initialBooks?: Book[];
  /** Total inicial del Server Component. */
  initialTotal?: number;
}

export interface UseBooksResult {
  books: Book[];
  total: number;
  /** Página actual cargada (1-based). */
  page: number;
  /** true mientras se carga la primera página (primer fetch o cambio de filtros). */
  isLoading: boolean;
  /** true mientras "Cargar más" está en vuelo. */
  isLoadingMore: boolean;
  error: Error | null;
  /** true si `page * pageSize < total` (queda más por cargar). */
  hasMore: boolean;
  /** Carga la siguiente página y hace append. */
  loadMore: () => Promise<void>;
  /** Reintenta el primer fetch (estado error). */
  retry: () => Promise<void>;
}

const EMPTY_BOOKS: Book[] = [];

/**
 * Construye los query params de `GET /api/v1/books` desde `BookFilters`.
 * `rating_min` mapea al param `rating` (la API filtra por rating exacto 1-5).
 */
function buildParams(
  filters: BookFilters,
  page: number,
  pageSize: number,
): URLSearchParams {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("page_size", String(pageSize));
  if (filters.status) {
    params.set("status", filters.status);
  }
  if (filters.rating_min) {
    params.set("rating", String(filters.rating_min));
  }
  if (filters.q) {
    params.set("q", filters.q);
  }
  return params;
}

/**
 * Fetch de una página a `GET /api/v1/books` (relativo → proxy de `next.config`).
 * Autentica con el `access_token` de la sesión Supabase (Bearer header).
 * Lanza `Error` si la respuesta no es OK (401/422/500 → UI de error).
 */
async function fetchBooksPage(
  filters: BookFilters,
  page: number,
  pageSize: number,
  signal?: AbortSignal,
): Promise<PaginatedBooks> {
  const params = buildParams(filters, page, pageSize);

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const res = await fetch(`/api/v1/books?${params.toString()}`, {
    headers: session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : undefined,
    signal,
  });

  if (!res.ok) {
    throw new Error("No se pudieron cargar los libros");
  }

  return (await res.json()) as PaginatedBooks;
}

/**
 * Hook de datos del Library Grid (feature 013):
 * - Debounce interno de 300ms para `filters.q` (`useDebounce`).
 * - `useEffect [filters]` → resetea y fetch de la página 1 (AbortController).
 * - `loadMore` → append de la siguiente página.
 * - Seed opcional (`initialBooks`/`initialTotal`) para SSR sin skeleton flash.
 */
export function useBooks(
  filters: BookFilters,
  options: UseBooksOptions = {},
): UseBooksResult {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const initialBooks = options.initialBooks ?? EMPTY_BOOKS;
  const initialTotal = options.initialTotal ?? 0;

  // Escalares estables → el memo solo cambia cuando un valor efectivo cambia
  // (escribir `q` no dispara refetch hasta que el debounce estabiliza).
  const status = filters.status;
  const ratingMin = filters.rating_min;
  const debouncedQ = useDebounce(filters.q ?? "", SEARCH_DEBOUNCE_MS);

  const effectiveFilters = useMemo<BookFilters>(
    () => ({ status, rating_min: ratingMin, q: debouncedQ }),
    [status, ratingMin, debouncedQ],
  );
  const filtersKey = JSON.stringify([
    status ?? null,
    ratingMin ?? null,
    debouncedQ || null,
  ]);

  const [books, setBooks] = useState<Book[]>(initialBooks);
  const [total, setTotal] = useState<number>(initialTotal);
  const [isLoading, setIsLoading] = useState<boolean>(
    initialBooks.length === 0 && initialTotal === 0,
  );
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const pageRef = useRef(1);
  const isFirstRun = useRef(true);

  const loadFirstPage = useCallback(
    async (opts?: { signal?: AbortSignal; silent?: boolean }) => {
      if (!opts?.silent) {
        setIsLoading(true);
        setBooks([]);
        setTotal(0);
      }
      setError(null);
      pageRef.current = 1;
      try {
        const data = await fetchBooksPage(
          effectiveFilters,
          1,
          pageSize,
          opts?.signal,
        );
        if (opts?.signal?.aborted) return;
        setBooks(data.items);
        setTotal(data.total);
      } catch (err) {
        if (opts?.signal?.aborted) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        if (!opts?.signal?.aborted && !opts?.silent) {
          setIsLoading(false);
        }
      }
    },
    [effectiveFilters, pageSize],
  );

  useEffect(() => {
    const controller = new AbortController();

    if (isFirstRun.current && (initialBooks.length > 0 || initialTotal > 0)) {
      // Primer render con seed del Server Component: refresco silencioso para
      // que el cliente sincronice con la API sin flash de skeleton.
      isFirstRun.current = false;
      void loadFirstPage({ signal: controller.signal, silent: true });
    } else {
      // Primer render sin seed o cambio de filtros → fetch normal con skeleton.
      isFirstRun.current = false;
      void loadFirstPage({ signal: controller.signal });
    }

    return () => controller.abort();
  }, [loadFirstPage, initialBooks.length, initialTotal]);

  const loadMore = useCallback(async () => {
    if (isLoadingMore) return;
    const nextPage = pageRef.current + 1;
    setIsLoadingMore(true);
    try {
      const data = await fetchBooksPage(effectiveFilters, nextPage, pageSize);
      setBooks((prev) => [...prev, ...data.items]);
      setTotal(data.total);
      pageRef.current = nextPage;
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoadingMore(false);
    }
  }, [effectiveFilters, pageSize, isLoadingMore]);

  const retry = useCallback(() => loadFirstPage(), [loadFirstPage]);

  return {
    books,
    total,
    page: pageRef.current,
    isLoading,
    isLoadingMore,
    error,
    hasMore: pageRef.current * pageSize < total,
    loadMore,
    retry,
  };
}
