"use client";

import { useState } from "react";
import Image from "next/image";
import { Image as ImageIcon, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { BookSuggestion } from "@/types/book";

export interface SuggestionsDropdownProps {
  items: BookSuggestion[];
  isLoading: boolean;
  /** Consulta actual (para el mensaje de vacío "Sin resultados para 'X'"). */
  query: string;
  /** Índice activo (resaltado por teclado); -1 = ninguno. */
  activeIndex: number;
  listboxId: string;
  onSelect: (item: BookSuggestion) => void;
  onMouseEnter: (index: number) => void;
  listRef: React.Ref<HTMLUListElement>;
}

/** Id estable de una opción para `aria-activedescendant`. */
export function optionId(listboxId: string, index: number): string {
  return `${listboxId}-option-${index}`;
}

/** Portada con fallback placeholder (`alt` traducido + `onError`). */
function SuggestionCover({ item }: { item: BookSuggestion }) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  const alt = t("suggestions.coverAlt", { title: item.title });

  if (!item.cover_url || failed) {
    return (
      <div
        className="flex size-10 shrink-0 items-center justify-center rounded bg-muted"
        role="img"
        aria-label={t("suggestions.noCoverAria")}
      >
        <ImageIcon
          className="size-5 text-muted-foreground/60"
          aria-hidden="true"
        />
      </div>
    );
  }

  return (
    <Image
      src={item.cover_url}
      alt={alt}
      width={40}
      height={40}
      className="size-10 shrink-0 rounded object-cover"
      onError={() => setFailed(true)}
    />
  );
}

/**
 * Dropdown de sugerencias (feature 023): presentacional, sin teclado (el
 * teclado lo gestiona el combobox). Renderiza loading, estado vacío o la lista
 * de sugerencias con portada (`alt` + fallback), título, autores y badge de
 * biblioteca. Lista scrollable de ancho completo en viewports < 640px.
 */
export function SuggestionsDropdown({
  items,
  isLoading,
  query,
  activeIndex,
  listboxId,
  onSelect,
  onMouseEnter,
  listRef,
}: SuggestionsDropdownProps) {
  const { t } = useTranslation();

  return (
    <div
      className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
      data-testid="suggestions-dropdown"
      // Evita el blur del input al hacer clic en las opciones.
      onMouseDown={(e) => e.preventDefault()}
    >
      {isLoading ? (
        <div
          className="flex items-center gap-2 p-3 text-sm text-muted-foreground"
          role="status"
          aria-label={t("suggestions.loadingAria")}
          data-testid="suggestions-loading"
        >
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        </div>
      ) : items.length === 0 ? (
        <div
          className="p-3 text-sm text-muted-foreground"
          role="status"
          data-testid="suggestions-empty"
        >
          {t("suggestions.empty", { query })}
        </div>
      ) : (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          className="max-h-64 overflow-y-auto py-1"
        >
          {items.map((item, index) => (
            <li
              key={`${item.source}-${item.isbn13}`}
              id={optionId(listboxId, index)}
              role="option"
              aria-selected={index === activeIndex}
              onMouseEnter={() => onMouseEnter(index)}
              onClick={() => onSelect(item)}
              className={cn(
                "flex cursor-pointer items-center gap-3 px-3 py-2 text-sm focus:outline-none",
                index === activeIndex && "bg-accent text-accent-foreground",
              )}
            >
              <SuggestionCover item={item} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{item.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {item.authors.join(", ")}
                </p>
              </div>
              {item.source === "library" && (
                <Badge variant="secondary">{t("suggestions.inLibrary")}</Badge>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
