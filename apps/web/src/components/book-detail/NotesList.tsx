"use client";

import { Note } from "@/types/book";
import { NoteCard } from "./NoteCard";

interface NotesListProps {
  notes: Note[];
}

export function NotesList({ notes }: NotesListProps) {
  if (notes.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        <p>No hay notas aún. ¡Escribe la primera arriba!</p>
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
