"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";

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
  /** Páginas cargadas hasta ahora (1-based). */
  page: number;
  /** true mientras se carga la primera página (primer fetch o cambio de filtros). */
  isLoading: boolean;
  /** true mientras "Cargar más" está en vuelo. */
  isLoadingMore: boolean;
  /** Error de la PRIMERA página (solo cuando no hay datos que mostrar). */
  error: Error | null;
  /** Error de "Cargar más" (no destructivo: los libros ya cargados se conservan). */
  loadMoreError: Error | null;
  /** true si queda más por cargar. */
  hasMore: boolean;
  /** Carga la siguiente página y hace append. */
  loadMore: () => Promise<void>;
  /** Reintenta el primer fetch (estado error). */
  retry: () => Promise<void>;
  /** Reintenta la carga de la siguiente página tras un fallo. */
  retryLoadMore: () => Promise<void>;
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
 * Hook de datos del Library Grid (feature 013) migrado a React Query
 * (feature 026):
 * - Fuente de datos única: una `useInfiniteQuery` cuya clave usa el prefijo
 *   `["books", ...]`, invalidable por la mutación de alta.
 * - Debounce de 300ms para `filters.q` (`useDebounce`): el refetch solo ocurre
 *   cuando el valor debounced se estabiliza (un cambio de `q` no dispara
 *   requests por keystroke).
 * - Paginación "Cargar más" con append ordenado (`useInfiniteQuery`).
 * - Seed opcional (`initialBooks`/`initialTotal`) como `initialData` de la
 *   primera query para SSR/hidratación sin flash de skeleton.
 * - Error inicial y error de paginación separados: un fallo de la segunda
 *   página conserva los libros ya cargados (no reemplaza el grid).
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

  const queryKey = useMemo(
    () => ["books", filtersKey, pageSize] as const,
    [filtersKey, pageSize],
  );

  // El seed del Server Component solo se aplica a la PRIMERA query (primera
  // página con los filtros iniciales). Un cambio de filtros crea una query
  // nueva sin seed → skeleton (comportamiento 013 intacto).
  const isFirstQuery = useRef(true);
  useEffect(() => {
    isFirstQuery.current = false;
  }, []);

  const initialData = useMemo(() => {
    if (initialBooks.length === 0 && initialTotal === 0) {
      return undefined;
    }
    return {
      pages: [
        {
          items: initialBooks,
          total: initialTotal,
          page: 1,
          page_size: pageSize,
          total_pages: Math.max(1, Math.ceil(initialTotal / pageSize)),
        },
      ],
      pageParams: [1],
    };
  }, [initialBooks, initialTotal, pageSize]);

  const query = useInfiniteQuery<PaginatedBooks, Error>({
    queryKey,
    queryFn: ({ pageParam, signal }) =>
      fetchBooksPage(effectiveFilters, pageParam as number, pageSize, signal),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, p) => sum + p.items.length, 0);
      return loaded < lastPage.total ? lastPage.page + 1 : undefined;
    },
    // Solo la primera query recibe el seed; a partir del montaje se refresca en
    // silencio (staleTime 0) sin perder el render SSR inicial.
    initialData: isFirstQuery.current ? initialData : undefined,
    staleTime: 0,
  });

  const books = useMemo(
    () => query.data?.pages.flatMap((p) => p.items) ?? EMPTY_BOOKS,
    [query.data],
  );
  const lastPage = query.data
    ? query.data.pages[query.data.pages.length - 1]
    : undefined;
  const total = lastPage?.total ?? initialTotal;
  const page = query.data?.pages.length ?? 1;

  // Un fallo de "Cargar más" (fetchNextPage, dirección "forward") NO contamina
  // el error de primera carga: el grid conserva sus libros.
  const error = query.isFetchNextPageError ? null : (query.error ?? null);
  const loadMoreError = query.isFetchNextPageError
    ? (query.error ?? null)
    : null;

  const { fetchNextPage, isFetchingNextPage, refetch } = query;

  const loadMore = useCallback(async () => {
    if (isFetchingNextPage) return;
    await fetchNextPage();
  }, [fetchNextPage, isFetchingNextPage]);

  const retryLoadMore = useCallback(async () => {
    if (isFetchingNextPage) return;
    await fetchNextPage();
  }, [fetchNextPage, isFetchingNextPage]);

  const retry = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return {
    books,
    total,
    page,
    isLoading: query.isPending,
    isLoadingMore: query.isFetchingNextPage,
    error,
    loadMoreError,
    hasMore: query.hasNextPage,
    loadMore,
    retry,
    retryLoadMore,
  };
}
