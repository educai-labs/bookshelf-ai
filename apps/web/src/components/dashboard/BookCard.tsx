"use client";

import Image from "next/image";
import { useState } from "react";

import { RatingStars } from "@/components/book/RatingStars";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { Book, BookStatus } from "@/types/book";
import { cn } from "@/lib/utils";

export interface BookCardProps {
  book: Book;
  /** Callback de click → navegación a `/book/${book.id}`. */
  onClick: () => void;
}

const STATUS_LABELS: Record<BookStatus, string> = {
  want_to_read: "Quiero leer",
  reading: "Leyendo",
  read: "Leído",
};

/** Variant del Badge por status (T25): gray / blue / green-outline. */
const STATUS_VARIANTS: Record<BookStatus, "default" | "secondary" | "outline"> =
  {
    want_to_read: "secondary",
    reading: "default",
    read: "outline",
  };

const STATUS_CLASSES: Partial<Record<BookStatus, string>> = {
  read: "border-green-600 text-green-600",
};

/** Placeholder SVG inline para portadas sin imagen o con `onError`. */
function CoverPlaceholder() {
  return (
    <div
      className="flex size-full items-center justify-center bg-muted"
      data-testid="cover-placeholder"
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="size-12 text-muted-foreground/60"
      >
        <path
          fill="currentColor"
          d="M6 2h9a3 3 0 0 1 3 3v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm0 2v14h10V5a1 1 0 0 0-1-1H6zm2 3h4v2H8V7zm0 4h6v2H8v-2zm0 4h6v2H8v-2z"
        />
      </svg>
    </div>
  );
}

/**
 * Tarjeta individual de libro (feature 013):
 * - Portada con `Image` de Next.js (`fill` + `sizes` responsive) y fallback
 *   `onError` → placeholder SVG inline (sin request extra).
 * - Título (2 líneas), autores (1 línea), `RatingStars` readonly + `Badge`.
 * - Click (ratón o teclado Enter/Espacio) → `onClick` (navegación).
 */
export function BookCard({ book, onClick }: BookCardProps) {
  const [coverFailed, setCoverFailed] = useState(false);
  const showCover = Boolean(book.cover_url) && !coverFailed;

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick();
    }
  }

  return (
    <Card
      role="button"
      tabIndex={0}
      aria-label={book.title}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className="group cursor-pointer overflow-hidden transition-shadow hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <div className="relative aspect-[2/3] w-full bg-muted">
        {showCover ? (
          <Image
            src={book.cover_url as string}
            alt={book.title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"
            className="object-cover transition-transform group-hover:scale-105"
            loading="lazy"
            onError={() => setCoverFailed(true)}
          />
        ) : (
          <CoverPlaceholder />
        )}
      </div>
      <CardContent className="space-y-1 p-4">
        <h3 className="line-clamp-2 font-semibold leading-snug">
          {book.title}
        </h3>
        <p className="truncate text-sm text-muted-foreground">
          {book.authors.join(", ")}
        </p>
        <div className="flex items-center justify-between gap-2 pt-1">
          <RatingStars rating={book.rating} size="sm" />
          <Badge
            variant={STATUS_VARIANTS[book.status]}
            className={cn(STATUS_CLASSES[book.status])}
          >
            {STATUS_LABELS[book.status]}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
