"use client";

import { useEffect, useRef, useState } from "react";

import { BookSearchCombobox } from "@/components/search/BookSearchCombobox";
import { SEARCH_DEBOUNCE_MS } from "@/lib/hooks/useBooks";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { useTranslation } from "@/lib/i18n";
import type { BookSuggestion } from "@/types/book";

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Delay del debounce (default 300ms, convención feature 013). */
  debounceMs?: number;
  /** Selección de una sugerencia (biblioteca → ficha, catálogo → modal). */
  onSelectSuggestion?: (item: BookSuggestion) => void;
  /** Error de sugerencias (toast no bloqueante en el padre). */
  onSuggestionError?: (error: Error) => void;
}

/**
 * Input de búsqueda combinado con sugerencias (features 013 + 023).
 *
 * - El texto inmediato vive en `localValue` (combobox); el filtro `q` del grid
 *   se propaga debounced vía `onChange` (comportamiento 013 intacto).
 * - Enter sin selección aplica el texto inmediatamente como filtro.
 * - Las sugerencias las gestiona `BookSearchCombobox` internamente
 *   (`useBookSuggestions`, debounce 300ms, umbral 3 caracteres).
 * - Sincroniza desde `value` si cambia externamente (p. ej. limpiar búsqueda).
 */
export function SearchInput({
  value,
  onChange,
  debounceMs = SEARCH_DEBOUNCE_MS,
  onSelectSuggestion,
  onSuggestionError,
}: SearchInputProps) {
  const [localValue, setLocalValue] = useState(value);
  const debounced = useDebounce(localValue, debounceMs);
  const { t } = useTranslation();
  const lastEmitted = useRef(value);

  // Propaga el valor debounced hacia el padre (filtro `q`).
  useEffect(() => {
    if (debounced !== lastEmitted.current) {
      lastEmitted.current = debounced;
      onChange(debounced);
    }
  }, [debounced, onChange]);

  // Sync cuando el padre resetea/precarga el valor.
  useEffect(() => {
    if (value !== lastEmitted.current) {
      lastEmitted.current = value;
      setLocalValue(value);
    }
  }, [value]);

  function handleApplyQuery(q: string) {
    lastEmitted.current = q;
    setLocalValue(q);
    onChange(q);
  }

  return (
    <BookSearchCombobox
      inputId="dashboard-search"
      value={localValue}
      onValueChange={setLocalValue}
      onSelect={onSelectSuggestion ?? (() => {})}
      onApplyQuery={handleApplyQuery}
      onError={onSuggestionError}
      placeholder={t("dashboard.filters.searchPlaceholder")}
      ariaLabel={t("dashboard.filters.searchAria")}
    />
  );
}
