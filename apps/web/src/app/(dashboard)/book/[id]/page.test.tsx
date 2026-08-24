import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BookDetailClient } from "@/app/(dashboard)/book/[id]/BookDetailClient";

// Mock the API functions
vi.mock("@/lib/api/books", () => ({
  getBook: vi.fn(),
  getBookNotes: vi.fn(),
}));

import { getBook, getBookNotes } from "@/lib/api/books";

const mockBook = {
  id: "book-1",
  user_id: "user-1",
  isbn13: "9780123456789",
  title: "Test Book",
  authors: ["Author One"],
  cover_url: "https://example.com/cover.jpg",
  page_count: 300,
  publisher: "Test Publisher",
  published_date: "2024-01-15",
  description: "Test description",
  status: "want_to_read" as const,
  rating: null,
  started_at: null,
  finished_at: null,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  notes_count: 0,
};

const mockNotes = [
  {
    id: "note-1",
    book_id: "book-1",
    content: "Test note",
    content_html: "<p>Test note</p>",
    chunk_index: 0,
    created_at: "2024-01-01T00:00:00Z",
  },
];

function renderClient(book = mockBook, notes = mockNotes) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <BookDetailClient book={book} notes={notes} />
    </QueryClientProvider>,
  );
}

describe("BookDetailPage (via BookDetailClient)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getBook).mockReset();
    vi.mocked(getBookNotes).mockReset();
    vi.mocked(getBook).mockResolvedValue(mockBook);
    vi.mocked(getBookNotes).mockResolvedValue({
      items: mockNotes,
      total: 1,
      page: 1,
      page_size: 50,
    });
  });

  it("renders BookHeader with book data", () => {
    renderClient();

    expect(screen.getByText("Test Book")).toBeInTheDocument();
    expect(screen.getByText("Author One")).toBeInTheDocument();
  });

  it("renders metadata section", () => {
    renderClient();

    expect(screen.getByText("Detalles del libro")).toBeInTheDocument();
    // Text appears in both header and metadata section, check for metadata section specific labels
    expect(screen.getByText("Editorial")).toBeInTheDocument();
    expect(screen.getByText("Fecha publicación")).toBeInTheDocument();
    expect(screen.getByText("Páginas")).toBeInTheDocument();
    expect(screen.getByText("ISBN-13")).toBeInTheDocument();
    // These values appear in both header and metadata - use getAllByText to verify both
    expect(screen.getAllByText("Test Publisher")).toHaveLength(2);
    expect(screen.getAllByText("2024-01-15")).toHaveLength(2);
    expect(screen.getAllByText("300")).toHaveLength(2);
    expect(screen.getAllByText("9780123456789")).toHaveLength(2);
    expect(screen.getByText("Test description")).toBeInTheDocument();
  });

  it("renders ReadingControls", () => {
    renderClient();

    expect(screen.getByText("Progreso de lectura")).toBeInTheDocument();
    expect(screen.getByText("Estado")).toBeInTheDocument();
    expect(screen.getByText("Valoración")).toBeInTheDocument();
  });

  it("renders NoteEditor", () => {
    renderClient();

    expect(screen.getByText("Editor de notas (Markdown)")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/escribe tu nota en markdown/i),
    ).toBeInTheDocument();
  });

  it("renders NotesList with note count", () => {
    renderClient(mockBook, mockNotes);

    expect(screen.getByText("Notas guardadas (1)")).toBeInTheDocument();
    expect(screen.getByText("Test note")).toBeInTheDocument();
  });

  it("renders ChatButton", () => {
    renderClient();

    expect(screen.getByText("Chat con este libro")).toBeInTheDocument();
  });

  it("shows empty state when no notes", () => {
    renderClient(mockBook, []);

    expect(
      screen.getByText("No hay notas aún. ¡Escribe la primera arriba!"),
    ).toBeInTheDocument();
  });
});
