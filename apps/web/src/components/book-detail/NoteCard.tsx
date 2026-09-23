"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Note } from "@/types/book";
import { deleteNote } from "@/lib/api/books";
import { sanitizeHtml } from "@/utils/sanitize";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/settings/ConfirmDialog";
import { useTranslation } from "@/lib/i18n";
import { useSettings } from "@/contexts/SettingsContext";
import { formatRelativeTime } from "@/lib/formatters";

interface NoteCardProps {
  note: Note;
}

export function NoteCard({ note }: NoteCardProps) {
  const { t, language } = useTranslation();
  const { settings } = useSettings();
  const router = useRouter();
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: () => deleteNote(note.book_id, note.id),
    onSuccess: () => {
      toast.success(t("notes.deleted"));
      queryClient.invalidateQueries({ queryKey: ["bookNotes", note.book_id] });
      router.refresh();
    },
    onError: (error: Error) => {
      // Notificación de errores (sección 3.5): solo si está activada.
      if (settings.notifications.errors) {
        toast.error(`${t("notes.deleteError")}: ${error.message}`);
      }
    },
  });

  const handleDelete = () => {
    deleteMutation.mutateAsync().catch(() => {
      // El error ya se notificó vía `onError`.
    });
  };

  // `confirmDeletions` (sección 3.3): confirmación previa si está activada.
  const deleteButton = settings.reader.confirmDeletions ? (
    <ConfirmDialog
      triggerLabel={t("notes.delete")}
      title={t("notes.delete")}
      description={t("notes.deleteConfirm")}
      confirmLabel={t("common.delete")}
      cancelLabel={t("common.cancel")}
      destructive
      onConfirm={handleDelete}
    />
  ) : (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleDelete}
      disabled={deleteMutation.isPending}
      aria-label={t("notes.delete")}
    >
      <Trash2 className="size-4" />
    </Button>
  );

  return (
    <div data-testid="note-card" className="space-y-3 rounded-lg border p-4">
      {/* Header: fecha + badge chunk_index + eliminar */}
      <div className="flex items-center justify-between gap-2">
        <time
          dateTime={note.created_at}
          className="text-sm text-muted-foreground"
        >
          {formatRelativeTime(language, note.created_at)}
        </time>
        <div className="flex items-center gap-2">
          {note.chunk_index > 0 && (
            <Badge variant="outline" className="text-xs">
              {t("notes.vectorized")}
            </Badge>
          )}
          {deleteButton}
        </div>
      </div>

      {/* Contenido renderizado */}
      <div
        className="prose prose-sm max-w-none"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(note.content_html) }}
      />
    </div>
  );
}
