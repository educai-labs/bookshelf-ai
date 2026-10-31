import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { StatusBadge } from "../StatusBadge";
import { BookCard } from "@/components/dashboard/BookCard";
import { BookHeader } from "@/components/book-detail/BookHeader";
import type { Book, BookStatus } from "@/types/book";

vi.mock("@/lib/api/books", () => ({
  deleteBook: vi.fn(),
}));

function makeBook(status: BookStatus): Book {
  return {
    id: "b1",
    user_id: "u1",
    isbn13: "9780306406157",
    title: "Clean Code",
    authors: ["Robert C. Martin"],
    cover_url: null,
    page_count: 464,
    publisher: "Prentice Hall",
    published_date: "2008-08-01",
    description: "Un libro sobre código limpio.",
    status,
    rating: null,
    started_at: null,
    finished_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    notes_count: 0,
  };
}

const STATUS_LABELS: Record<BookStatus, string> = {
  want_to_read: "Quiero leer",
  reading: "Leyendo",
  read: "Leído",
};

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});

describe("StatusBadge (feature 030 · Z1-08)", () => {
  it.each(Object.keys(STATUS_LABELS) as BookStatus[])(
    "renderiza la etiqueta i18n para %s",
    (status) => {
      render(<StatusBadge status={status} />);
      expect(screen.getByText(STATUS_LABELS[status])).toBeInTheDocument();
    },
  );

  it.each([
    ["want_to_read", "bg-secondary"],
    ["reading", "bg-primary"],
    ["read", "border-green-600"],
  ] as const)(
    "aplica la variante/clases compartidas para %s",
    (status, cls) => {
      const { getByText } = render(<StatusBadge status={status} />);
      expect(getByText(STATUS_LABELS[status]).className).toContain(cls);
    },
  );
});

describe("paridad de badge entre BookCard y BookHeader", () => {
  it.each(Object.keys(STATUS_LABELS) as BookStatus[])(
    "mismo badge (clases) para %s en ambas vistas",
    (status) => {
      const cardView = render(<BookCard book={makeBook(status)} />);
      const cardBadge = within(cardView.container).getByText(
        STATUS_LABELS[status],
      );

      const headerView = render(
        <QueryClientProvider client={queryClient}>
          <BookHeader book={makeBook(status)} />
        </QueryClientProvider>,
      );
      const headerBadge = within(headerView.container).getByText(
        STATUS_LABELS[status],
      );

      expect(headerBadge.className).toBe(cardBadge.className);
    },
  );
});
