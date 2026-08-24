"use client";

import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { SEARCH_DEBOUNCE_MS } from "@/lib/hooks/useBooks";
import { useDebounce } from "@/lib/hooks/useDebounce";

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Delay del debounce (default 300ms, convención feature 013). */
  debounceMs?: number;
}

/**
 * Input de búsqueda debounced (feature 013): el usuario escribe y `onChange`
 * se llama con el valor estabilizado tras `debounceMs` (default 300ms) — no en
 * cada keystroke. Sincroniza desde `value` si cambia desde fuera (props).
 */
export function SearchInput({
  value,
  onChange,
  debounceMs = SEARCH_DEBOUNCE_MS,
}: SearchInputProps) {
  const [localValue, setLocalValue] = useState(value);
  const debounced = useDebounce(localValue, debounceMs);

  // Propagación del valor debounced hacia el padre.
  useEffect(() => {
    if (debounced !== value) {
      onChange(debounced);
    }
  }, [debounced, value, onChange]);

  // Sync cuando el padre resetea el valor (p. ej. limpiar búsqueda).
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  return (
    <Input
      type="search"
      value={localValue}
      placeholder="Buscar título o autor..."
      aria-label="Buscar título o autor"
      onChange={(e) => setLocalValue(e.target.value)}
    />
  );
}
