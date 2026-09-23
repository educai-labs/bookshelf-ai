"use client";

import { Note } from "@/types/book";
import { useTranslation } from "@/lib/i18n";
import { NoteCard } from "./NoteCard";

interface NotesListProps {
  notes: Note[];
}

export function NotesList({ notes }: NotesListProps) {
  const { t } = useTranslation();
  if (notes.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        <p>{t("notes.empty")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {notes.map((note) => (
        <NoteCard key={note.id} note={note} />
      ))}
    </div>
  );
}
