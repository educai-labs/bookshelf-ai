"use client";

import { type CSSProperties } from "react";

import { Book, Note } from "@/types/book";
import { BookHeader } from "@/components/book-detail/BookHeader";
import { ReadingControls } from "@/components/book-detail/ReadingControls";
import { NoteEditor } from "@/components/book-detail/NoteEditor";
import { NotesList } from "@/components/book-detail/NotesList";
import { ChatButton } from "@/components/book-detail/ChatButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTranslation } from "@/lib/i18n";
import { useSettings } from "@/contexts/SettingsContext";
import type { ReadingFont } from "@/types/settings";

interface BookDetailClientProps {
  book: Book;
  notes: Note[];
}

const FONT_FAMILIES: Record<ReadingFont, string> = {
  system: "system-ui, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  sans: "Arial, sans-serif",
};

export function BookDetailClient({ book, notes }: BookDetailClientProps) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const reader = settings.reader;

  const readingStyle: CSSProperties = {
    fontSize: `${reader.fontSize}px`,
    lineHeight: `${reader.lineHeight}`,
    fontFamily: FONT_FAMILIES[reader.font],
    maxWidth: `${reader.lineWidth}px`,
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header: portada + info + badges */}
      <BookHeader book={book} />

      <Separator />

      {/* Metadatos expandibles (info adicional según preferencia del lector) */}
      {reader.showBookDetails && (
        <>
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between">
              <CardTitle className="text-lg">{t("book.details")}</CardTitle>
            </summary>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {t("book.publisher")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  {book.publisher || "—"}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {t("book.publicationDate")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  {book.published_date || "—"}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {t("book.pages")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  {book.page_count?.toString() || "—"}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {t("book.isbn13Label")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 font-mono text-sm">
                  {book.isbn13}
                </CardContent>
              </Card>
            </div>
            {book.description && (
              <div className="mt-4" style={readingStyle}>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("book.description")}
                </CardTitle>
                <p className="prose prose-sm mt-2 max-w-none text-sm">
                  {book.description}
                </p>
              </div>
            )}
          </details>

          <Separator />
        </>
      )}

      {/* Controles de lectura */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("book.readingProgress")}</CardTitle>
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
            {t("book.notesEditor")}
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
            {t("book.notesTitle")} ({notes.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            <div style={readingStyle}>
              <NotesList notes={notes} />
            </div>
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
