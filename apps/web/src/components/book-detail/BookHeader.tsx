"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Book } from "@/types/book";
import { deleteBook } from "@/lib/api/books";
import { useTranslation } from "@/lib/i18n";
import { useSettings } from "@/contexts/SettingsContext";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { RatingStars } from "@/components/book/RatingStars";
import { StatusBadge } from "@/components/book/StatusBadge";

interface BookHeaderProps {
  book: Book;
}

export function BookHeader({ book }: BookHeaderProps) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const router = useRouter();
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: () => deleteBook(book.id),
    onSuccess: async () => {
      if (settings.notifications.account) {
        toast.success(t("book.deleted"));
      }
      queryClient.invalidateQueries({ queryKey: ["books"] });
      router.push("/dashboard");
    },
    onError: (error: Error) => {
      if (settings.notifications.errors) {
        toast.error(`${t("book.deleteError")}: ${error.message}`);
      }
    },
  });

  const handleDelete = () => {
    deleteMutation.mutateAsync().catch(() => {
      // El error ya se notificó vía `onError`.
    });
  };

  // `confirmDeletions` (sección 3.3): confirmación previa si está activada;
  // borrado directo en caso contrario.
  const deleteButton = settings.reader.confirmDeletions ? (
    <ConfirmDialog
      triggerLabel={t("book.delete")}
      title={t("book.delete")}
      description={t("book.deleteConfirm")}
      confirmLabel={t("common.delete")}
      cancelLabel={t("common.cancel")}
      destructive
      onConfirm={handleDelete}
    />
  ) : (
    <Button
      variant="destructive"
      onClick={handleDelete}
      disabled={deleteMutation.isPending}
      aria-label={t("book.delete")}
    >
      <Trash2 className="size-4" />
      {t("book.delete")}
    </Button>
  );

  return (
    <div className="flex flex-col gap-6 sm:flex-row">
      {/* Portada - priority para LCP */}
      <div className="relative aspect-[2/3] w-full flex-shrink-0 sm:w-[300px]">
        {book.cover_url ? (
          <Image
            src={book.cover_url}
            alt={t("book.coverAlt", { title: book.title })}
            fill
            priority
            sizes="(max-width: 640px) 100vw, 300px"
            className="rounded-lg object-cover shadow-lg"
            placeholder="blur"
            blurDataURL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
          />
        ) : (
          <div className="flex size-full items-center justify-center rounded-lg bg-muted">
            <span className="text-muted-foreground">{t("book.noCover")}</span>
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
              : t("book.unknownAuthor")}
          </p>

          {book.publisher && (
            <p className="mt-2 text-sm text-muted-foreground">
              {t("book.publisher")}:{" "}
              <span className="font-medium">{book.publisher}</span>
            </p>
          )}

          {book.published_date && (
            <p className="mt-1 text-sm text-muted-foreground">
              {t("book.published")}:{" "}
              <span className="font-medium">{book.published_date}</span>
            </p>
          )}

          {book.page_count && (
            <p className="mt-1 text-sm text-muted-foreground">
              {t("book.pages")}:{" "}
              <span className="font-medium">{book.page_count}</span>
            </p>
          )}

          <p className="mt-1 text-sm text-muted-foreground">
            {t("book.isbn")}:{" "}
            <span className="font-mono text-xs font-medium">{book.isbn13}</span>
          </p>
        </div>

        {/* Badges: Status + Rating */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <StatusBadge status={book.status} />

          {book.rating !== null && book.rating > 0 && (
            <RatingStars rating={book.rating} size="md" />
          )}
        </div>

        {/* Eliminar libro (confirmación según preferencia del lector) */}
        <div className="mt-4 flex justify-end">{deleteButton}</div>
      </div>
    </div>
  );
}
