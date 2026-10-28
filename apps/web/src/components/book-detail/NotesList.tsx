"use client";

import { useInfiniteQuery } from "@tanstack/react-query";

import { PaginatedNotes } from "@/types/book";
import { getBookNotes } from "@/lib/api/books";
import { useTranslation } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { NoteCard } from "./NoteCard";

interface NotesListProps {
  bookId: string;
  initialNotes: PaginatedNotes;
}

const PAGE_SIZE = 50;

export function NotesList({ bookId, initialNotes }: NotesListProps) {
  const { t } = useTranslation();

  // Fuente de datos única: `["bookNotes", bookId]`. El update optimista del
  // editor escribe en esta misma query (forma infinita paginada).
  const query = useInfiniteQuery<PaginatedNotes, Error>({
    queryKey: ["bookNotes", bookId],
    queryFn: ({ pageParam }) =>
      getBookNotes(bookId, { page: pageParam as number, pageSize: PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, p) => sum + p.items.length, 0);
      return loaded < lastPage.total ? lastPage.page + 1 : undefined;
    },
    initialData: {
      pages: [initialNotes],
      pageParams: [1],
    },
    staleTime: 0,
  });

  const notes = query.data?.pages.flatMap((p) => p.items) ?? [];

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

      {query.hasNextPage && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            onClick={() => query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
          >
            {query.isFetchingNextPage
              ? t("common.loading")
              : t("notes.loadMore")}
          </Button>
        </div>
      )}
    </div>
  );
}
