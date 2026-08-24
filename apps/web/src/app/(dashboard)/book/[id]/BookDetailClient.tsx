"use client";

import { Book, Note } from "@/types/book";
import { BookHeader } from "@/components/book-detail/BookHeader";
import { ReadingControls } from "@/components/book-detail/ReadingControls";
import { NoteEditor } from "@/components/book-detail/NoteEditor";
import { NotesList } from "@/components/book-detail/NotesList";
import { ChatButton } from "@/components/book-detail/ChatButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";

interface BookDetailClientProps {
  book: Book;
  notes: Note[];
}

export function BookDetailClient({ book, notes }: BookDetailClientProps) {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header: portada + info + badges */}
      <BookHeader book={book} />

      <Separator />

      {/* Metadatos expandibles */}
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between">
          <CardTitle className="text-lg">Detalles del libro</CardTitle>
        </summary>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Editorial
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">{book.publisher || "—"}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Fecha publicación
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {book.published_date || "—"}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Páginas
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {book.page_count?.toString() || "—"}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                ISBN-13
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 font-mono text-sm">
              {book.isbn13}
            </CardContent>
          </Card>
        </div>
        {book.description && (
          <div className="mt-4">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Descripción
            </CardTitle>
            <p className="prose prose-sm mt-2 max-w-none text-sm">
              {book.description}
            </p>
          </div>
        )}
      </details>

      <Separator />

      {/* Controles de lectura */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Progreso de lectura</CardTitle>
        </CardHeader>
        <CardContent>
          <ReadingControls book={book} />
        </CardContent>
      </Card>

      <Separator />

      {/* Editor de notas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            Editor de notas (Markdown)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <NoteEditor bookId={book.id} />
        </CardContent>
      </Card>

      <Separator />

      {/* Lista de notas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-lg">
            Notas guardadas ({notes.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            <NotesList notes={notes} />
          </ScrollArea>
        </CardContent>
      </Card>

      <Separator />

      {/* Chat Button */}
      <div className="text-center">
        <ChatButton bookId={book.id} />
      </div>
    </div>
  );
}
