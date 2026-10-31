"use client";

import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { BookStatus } from "@/types/book";

/**
 * Mapa único status → variant/classes del badge (feature 030 · Z1-08).
 *
 * Compartido entre el dashboard (`BookCard`) y la ficha (`BookHeader`) para
 * garantizar paridad de color/clase por estado. Antes cada vista tenía su
 * propio mapeo (y `BookHeader` además renderizaba una pastilla gris fija),
 * por lo que el mismo libro se veía distinto según dónde se mirara.
 */
export const STATUS_VARIANTS: Record<
  BookStatus,
  "default" | "secondary" | "outline"
> = {
  want_to_read: "secondary",
  reading: "default",
  read: "outline",
};

/** Clases extra por estado (solo `read` añade acento verde). */
export const STATUS_CLASSES: Partial<Record<BookStatus, string>> = {
  read: "border-green-600 text-green-600",
};

export interface StatusBadgeProps {
  status: BookStatus;
}

/** Badge de estado de lectura con etiqueta i18n, variante y clases compartidas. */
export function StatusBadge({ status }: StatusBadgeProps) {
  const { t } = useTranslation();

  const STATUS_LABELS: Record<BookStatus, string> = {
    want_to_read: t("book.status.wantToRead"),
    reading: t("book.status.reading"),
    read: t("book.status.read"),
  };

  return (
    <Badge
      variant={STATUS_VARIANTS[status]}
      className={cn(STATUS_CLASSES[status])}
    >
      {STATUS_LABELS[status]}
    </Badge>
  );
}
