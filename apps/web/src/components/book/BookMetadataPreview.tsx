"use client";

import { useState } from "react";
import { ChevronDown, Image as ImageIcon } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";
import type { BookLookupResponse } from "@/types/book";

const DESCRIPTION_MAX_LINES = 3;
const DESCRIPTION_LINE_HEIGHT = 1.5; // rem

interface BookMetadataPreviewProps {
  data: BookLookupResponse | null;
  isLoading?: boolean;
}

/**
 * Preview de metadatos de un libro tras lookup por ISBN.
 * Muestra portada, título, autores, páginas, editorial, fecha, descripción.
 * Descripción truncada a 3 líneas con botón "Ver más" expandible.
 * Skeleton loading mientras `isLoading=true`.
 */
export function BookMetadataPreview({
  data,
  isLoading = false,
}: BookMetadataPreviewProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { t } = useTranslation();

  if (isLoading || !data) {
    return (
      <div
        className="space-y-4"
        role="status"
        aria-label={t("preview.loadingAria")}
      >
        <Skeleton className="mx-auto h-48 w-full max-w-xs rounded-lg" />
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-4 w-1/4" />
        <Skeleton className="h-4 w-1/3" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    );
  }

  const {
    cover_url,
    title,
    authors,
    page_count,
    publisher,
    published_date,
    description,
  } = data;

  const authorsText =
    authors.length > 0 ? authors.join(", ") : t("book.unknownAuthor");
  const pagesText = page_count ? `${page_count} ${t("preview.pages")}` : null;
  const publisherText = publisher
    ? `${t("book.publisher")}: ${publisher}`
    : null;
  const dateText = published_date
    ? `${t("book.published")}: ${published_date}`
    : null;

  // Truncado de descripción a 3 líneas
  const showTruncate = description && description.length > 200;
  const displayDescription =
    isExpanded || !showTruncate
      ? description
      : `${description.slice(0, 200)}...`;

  return (
    <div className="space-y-4">
      {/* Portada */}
      <div className="flex justify-center">
        {cover_url ? (
          <Image
            src={cover_url}
            alt={t("book.coverAlt", { title })}
            className="h-48 w-auto max-w-xs rounded-lg object-cover shadow-md"
            loading="lazy"
            width={300}
            height={450}
          />
        ) : (
          <div
            className={cn(
              "flex h-48 w-full max-w-xs items-center justify-center rounded-lg border-2 border-dashed border-muted",
            )}
            role="img"
            aria-label={t("preview.noCoverAria")}
          >
            <ImageIcon className="size-12 text-muted" />
          </div>
        )}
      </div>

      {/* Título y autores */}
      <div className="space-y-1 text-center">
        <h3 className="text-lg font-semibold leading-tight">{title}</h3>
        <p className="text-sm text-muted-foreground">{authorsText}</p>
      </div>

      {/* Metadatos: páginas, editorial, fecha */}
      <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-muted-foreground">
        {pagesText && <span>{pagesText}</span>}
        {publisherText && <span>{publisherText}</span>}
        {dateText && <span>{dateText}</span>}
      </div>

      {/* Descripción */}
      {description && (
        <div className="space-y-2">
          <p
            className={cn(
              "text-sm leading-relaxed",
              !isExpanded && showTruncate && "line-clamp-3",
            )}
            style={
              !isExpanded && showTruncate
                ? {
                    maxHeight: `${DESCRIPTION_MAX_LINES * DESCRIPTION_LINE_HEIGHT}rem`,
                  }
                : undefined
            }
          >
            {displayDescription}
          </p>
          {showTruncate && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1"
              onClick={() => setIsExpanded(!isExpanded)}
              aria-expanded={isExpanded}
              aria-controls="book-description"
            >
              {isExpanded ? t("preview.showLess") : t("preview.showMore")}
              <ChevronDown
                className={cn(
                  "h-3 w-3 transition-transform",
                  isExpanded && "rotate-180",
                )}
              />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
