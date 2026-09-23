"use client";

import { useEffect, useRef, useState } from "react";

import {
  SuggestionsDropdown,
  optionId,
} from "@/components/search/SuggestionsDropdown";
import { Input } from "@/components/ui/input";
import {
  SUGGESTION_MIN_CHARS,
  useBookSuggestions,
} from "@/lib/hooks/useBookSuggestions";
import type { BookSuggestion } from "@/types/book";

export interface BookSearchComboboxProps {
  /** Texto inmediato del input. */
  value: string;
  /** Cambio inmediato del texto (cada keystroke). */
  onValueChange: (value: string) => void;
  /** Selección de una sugerencia (biblioteca o catálogo). */
  onSelect: (item: BookSuggestion) => void;
  /** Enter sin selección → aplica el texto como filtro. */
  onApplyQuery?: (value: string) => void;
  /** Error de sugerencias (para toast no bloqueante en el padre). */
  onError?: (error: Error) => void;
  /**
   * Notifica al padre cuándo el dropdown está visible. Permite que un
   * contenedor (p. ej. un Dialog) priorice el cierre del dropdown sobre su
   * propio cierre con Escape mientras el dropdown esté abierto.
   */
  onDropdownOpenChange?: (open: boolean) => void;
  placeholder?: string;
  ariaLabel?: string;
  inputId?: string;
}

/**
 * Combobox de búsqueda (feature 023): input + dropdown de sugerencias con
 * roles ARIA (`role="combobox"`, `aria-expanded`, `aria-activedescendant`,
 * `aria-controls`, opciones `role="option"`), foco visible y navegación por
 * teclado (↑/↓ mueven el resaltado, Enter selecciona o aplica el texto,
 * Escape cierra el dropdown).
 */
export function BookSearchCombobox({
  value,
  onValueChange,
  onSelect,
  onApplyQuery,
  onError,
  onDropdownOpenChange,
  placeholder,
  ariaLabel,
  inputId,
}: BookSearchComboboxProps) {
  const { suggestions, isLoading, error, hasMinChars } =
    useBookSuggestions(value);

  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const listboxId = `${inputId ?? "search"}-listbox`;
  const trimmed = value.trim();
  const showDropdown = isOpen && hasMinChars;

  // Expone al padre el estado de apertura del dropdown para que pueda
  // coordinar el manejo de Escape (p. ej. un Dialog que no debe cerrarse
  // mientras el dropdown esté abierto).
  useEffect(() => {
    onDropdownOpenChange?.(showDropdown);
  }, [showDropdown, onDropdownOpenChange]);

  // Notifica el error al padre (una vez por error, no por cada keystroke).
  const lastErrorRef = useRef<Error | null>(null);
  useEffect(() => {
    if (error && error !== lastErrorRef.current) {
      lastErrorRef.current = error;
      onError?.(error);
    }
  }, [error, onError]);

  function closeDropdown() {
    setIsOpen(false);
    setActiveIndex(-1);
  }

  function handleChange(next: string) {
    onValueChange(next);
    setActiveIndex(-1);
    if (next.trim().length >= SUGGESTION_MIN_CHARS) {
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      if (showDropdown) {
        event.preventDefault();
        closeDropdown();
        return;
      }
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (
        showDropdown &&
        activeIndex >= 0 &&
        activeIndex < suggestions.length
      ) {
        onSelect(suggestions[activeIndex]);
      } else if (trimmed) {
        onApplyQuery?.(trimmed);
      }
      closeDropdown();
      return;
    }

    if (!showDropdown || suggestions.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    }
  }

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        id={inputId}
        type="search"
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls={showDropdown ? listboxId : undefined}
        aria-activedescendant={
          showDropdown && activeIndex >= 0
            ? optionId(listboxId, activeIndex)
            : undefined
        }
        aria-autocomplete="list"
        aria-label={ariaLabel}
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (hasMinChars) setIsOpen(true);
        }}
        onBlur={() => closeDropdown()}
      />
      {showDropdown && (
        <SuggestionsDropdown
          items={suggestions}
          isLoading={isLoading}
          query={trimmed}
          activeIndex={activeIndex}
          listboxId={listboxId}
          onSelect={(item) => {
            onSelect(item);
            closeDropdown();
          }}
          onMouseEnter={setActiveIndex}
          listRef={listRef}
        />
      )}
    </div>
  );
}
