"use client";

import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Note } from "@/types/book";
import { sanitizeHtml } from "@/utils/sanitize";
import { Badge } from "@/components/ui/badge";

interface NoteCardProps {
  note: Note;
}

export function NoteCard({ note }: NoteCardProps) {
  return (
    <div data-testid="note-card" className="space-y-3 rounded-lg border p-4">
      {/* Header: fecha + badge chunk_index */}
      <div className="flex items-center justify-between">
        <time
          dateTime={note.created_at}
          className="text-sm text-muted-foreground"
        >
          {formatDistanceToNow(new Date(note.created_at), {
            addSuffix: true,
            locale: es,
          })}
        </time>
        {note.chunk_index > 0 && (
          <Badge variant="outline" className="text-xs">
            Vectorizado
          </Badge>
        )}
      </div>

      {/* Contenido renderizado */}
      <div
        className="prose prose-sm max-w-none"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(note.content_html) }}
      />
    </div>
  );
}
