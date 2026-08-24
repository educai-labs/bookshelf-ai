"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";
import { Book } from "@/types/book";

interface BookHeaderProps {
  book: Book;
}

/** Mapea estado a variante de badge shadcn */
function statusVariant(
  status: Book["status"],
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "reading":
      return "default"; // azul
    case "read":
      return "secondary"; // verde-ish
    case "want_to_read":
    default:
      return "outline";
  }
}

/** Etiqueta legible del estado */
function statusLabel(status: Book["status"]): string {
  switch (status) {
    case "reading":
      return "Leyendo";
    case "read":
      return "Leído";
    case "want_to_read":
    default:
      return "Por leer";
  }
}

export function BookHeader({ book }: BookHeaderProps) {
  return (
    <div className="flex flex-col gap-6 sm:flex-row">
      {/* Portada - priority para LCP */}
      <div className="relative aspect-[2/3] w-full flex-shrink-0 sm:w-[300px]">
        {book.cover_url ? (
          <Image
            src={book.cover_url}
            alt={`Portada de ${book.title}`}
            fill
            priority
            sizes="(max-width: 640px) 100vw, 300px"
            className="rounded-lg object-cover shadow-lg"
            placeholder="blur"
            blurDataURL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
          />
        ) : (
          <div className="flex size-full items-center justify-center rounded-lg bg-muted">
            <span className="text-muted-foreground">Sin portada</span>
          </div>
        )}
      </div>

      {/* Info + Badges */}
      <div className="flex min-w-0 flex-1 flex-col justify-between">
        <div>
          <h1 className="truncate text-3xl font-bold">{book.title}</h1>
          <p className="mt-1 text-lg text-muted-foreground">
            {book.authors.length > 0
              ? book.authors.join(", ")
              : "Autor desconocido"}
          </p>

          {book.publisher && (
            <p className="mt-2 text-sm text-muted-foreground">
              Editorial: <span className="font-medium">{book.publisher}</span>
            </p>
          )}

          {book.published_date && (
            <p className="mt-1 text-sm text-muted-foreground">
              Publicado:{" "}
              <span className="font-medium">{book.published_date}</span>
            </p>
          )}

          {book.page_count && (
            <p className="mt-1 text-sm text-muted-foreground">
              Páginas: <span className="font-medium">{book.page_count}</span>
            </p>
          )}

          <p className="mt-1 text-sm text-muted-foreground">
            ISBN:{" "}
            <span className="font-mono text-xs font-medium">{book.isbn13}</span>
          </p>
        </div>

        {/* Badges: Status + Rating */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
              "bg-muted text-muted-foreground",
            )}
          >
            {statusLabel(book.status)}
          </span>

          {book.rating !== null &&
            book.rating > 0 &&
            (() => {
              const rating = book.rating as number;
              return (
                <span
                  className="inline-flex items-center gap-1 text-amber-500"
                  aria-label={`Rating: ${rating} de 5`}
                >
                  {Array.from({ length: 5 }, (_, i) => (
                    <svg
                      key={i}
                      className={cn(
                        "size-4",
                        i < rating ? "fill-current" : "fill-muted text-muted",
                      )}
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                    </svg>
                  ))}
                </span>
              );
            })()}
        </div>
      </div>
    </div>
  );
}
