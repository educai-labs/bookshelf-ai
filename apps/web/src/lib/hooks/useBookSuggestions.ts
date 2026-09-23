"use client";

import { useEffect, useRef, useState } from "react";

import { getBookSuggestions } from "@/lib/api/books";
import { useDebounce } from "@/lib/hooks/useDebounce";
import type { BookSuggestion } from "@/types/book";

export const SUGGESTION_MIN_CHARS = 3;
export const SUGGESTION_LIMIT = 8;
export const SUGGESTION_DEBOUNCE_MS = 300;

export interface UseBookSuggestionsResult {
  /** Sugerencias mergeadas (biblioteca + catálogo) de la consulta actual. */
  suggestions: BookSuggestion[];
  /** true mientras la petición de sugerencias está en vuelo. */
  isLoading: boolean;
  /** Error recuperable (no bloquea el filtro del grid). */
  error: Error | null;
  /** true si la consulta (tras debounce) alcanza el mínimo de caracteres. */
  hasMinChars: boolean;
}

/**
 * Hook de sugerencias de búsqueda (feature 023):
 * - Debounce de 300 ms sobre el texto inmediato.
 * - Umbral de 3 caracteres: por debajo no se hace fetch (cero peticiones).
 * - `AbortController` para cancelar y descarte de respuestas obsoletas
 *   (identificador de petición monótono).
 * - Límite de 8 elementos para el dropdown.
 *
 * El error es recuperable: se expone vía `error` y la UI decide cómo
 * mostrarlo (toast no bloqueante) sin impedir el uso del filtro del grid.
 */
export function useBookSuggestions(query: string): UseBookSuggestionsResult {
  const trimmed = query.trim();
  const debouncedQuery = useDebounce(trimmed, SUGGESTION_DEBOUNCE_MS);
  const trimmedDebounced = debouncedQuery.trim();
  const hasMinChars = trimmedDebounced.length >= SUGGESTION_MIN_CHARS;

  const [suggestions, setSuggestions] = useState<BookSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!hasMinChars) {
      // Invalida peticiones en vuelo y limpia el estado.
      requestIdRef.current += 1;
      setSuggestions([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);

    getBookSuggestions(trimmedDebounced, SUGGESTION_LIMIT, controller.signal)
      .then((res) => {
        if (requestId !== requestIdRef.current) return; // respuesta obsoleta
        setSuggestions(res.items);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (requestId !== requestIdRef.current) return;
        setSuggestions([]);
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsLoading(false);
      });

    return () => controller.abort();
  }, [trimmedDebounced, hasMinChars]);

  return { suggestions, isLoading, error, hasMinChars };
}
