"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { RatingStars } from "@/components/book/RatingStars";
import { StatusBadge } from "@/components/book/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import type { Book } from "@/types/book";
import { useTranslation } from "@/lib/i18n";

export interface BookCardProps {
  book: Book;
}

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
 * Tarjeta individual de libro (features 013 + 030):
 * - Portada con `Image` de Next.js (`fill` + `sizes` responsive) y fallback
 *   `onError` → placeholder SVG inline (sin request extra).
 * - Título (2 líneas), autores (1 línea, con fallback i18n), `RatingStars`
 *   readonly + `StatusBadge` compartido.
 * - Card navegable mediante `Link` real a `/book/{id}` (prefetch de Next y
 *   "abrir en pestaña nueva" del menú contextual).
 */
export function BookCard({ book }: BookCardProps) {
  const [coverFailed, setCoverFailed] = useState(false);
  const { t } = useTranslation();
  const showCover = Boolean(book.cover_url) && !coverFailed;

  return (
    <Link
      href={`/book/${book.id}`}
      aria-label={book.title}
      className="group block cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Card className="overflow-hidden transition-shadow group-hover:shadow-lg">
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
            {book.authors.length > 0
              ? book.authors.join(", ")
              : t("book.unknownAuthor")}
          </p>
          <div className="flex items-center justify-between gap-2 pt-1">
            <RatingStars rating={book.rating} size="sm" />
            <StatusBadge status={book.status} />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
