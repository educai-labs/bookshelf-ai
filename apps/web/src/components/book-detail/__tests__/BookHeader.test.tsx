import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BookHeader } from "../BookHeader";

vi.mock("@/lib/api/books", () => ({
  deleteBook: vi.fn().mockResolvedValue(undefined),
}));

// Preferencias controlables por test (feature 022).
const confirmState = vi.hoisted(() => ({ confirmDeletions: true }));

vi.mock("@/contexts/SettingsContext", () => ({
  useSettings: () => ({
    settings: {
      reader: { confirmDeletions: confirmState.confirmDeletions },
      notifications: {
        errors: true,
        vectorizationDone: true,
        recommendations: true,
        account: true,
      },
      chat: { respondInInterfaceLanguage: true },
      privacy: { useNotesForSearch: true },
      language: "es",
      theme: "system",
    },
    language: "es",
    theme: "system",
    resolvedTheme: "system",
    setTheme: vi.fn(),
    setLanguage: vi.fn(),
    updateReader: vi.fn(),
    updateChat: vi.fn(),
    updateNotifications: vi.fn(),
    updatePrivacy: vi.fn(),
    isAccountLoaded: true,
    accountError: null,
    reducedMotion: false,
    loadChatHistory: vi.fn(),
    saveChatHistory: vi.fn(),
    clearChatHistory: vi.fn(),
    restoreDefaults: vi.fn(),
  }),
}));

import { deleteBook } from "@/lib/api/books";

const mockedDeleteBook = vi.mocked(deleteBook);

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});

function renderHeader(book: typeof mockBook) {
  return render(
    <QueryClientProvider client={queryClient}>
      <BookHeader book={book} />
    </QueryClientProvider>,
  );
}

const mockBook = {
  id: "book-1",
  user_id: "user-1",
  isbn13: "9780123456789",
  title: "Test Book Title",
  authors: ["Author One", "Author Two"],
  cover_url: "https://example.com/cover.jpg",
  page_count: 300,
  publisher: "Test Publisher",
  published_date: "2024-01-15",
  description: "Test description",
  status: "reading" as const,
  rating: 4,
  started_at: "2024-01-01",
  finished_at: "2024-01-15",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  notes_count: 0,
};

describe("BookHeader", () => {
  beforeEach(() => {
    mockedDeleteBook.mockReset();
    mockedDeleteBook.mockResolvedValue(undefined);
    confirmState.confirmDeletions = true;
  });

  it("renders cover image with priority (fetchpriority=high) and correct aspect ratio", () => {
    renderHeader(mockBook);

    const img = screen.getByAltText("Portada de Test Book Title");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("fetchpriority", "high");
    // Next.js Image renders as img with data-nimg="fill" for fill layout
    expect(img).toHaveAttribute("data-nimg", "fill");
  });

  it("renders fallback when no cover_url", () => {
    const bookNoCover = { ...mockBook, cover_url: null };
    renderHeader(bookNoCover);

    expect(screen.getByText("Sin portada")).toBeInTheDocument();
  });

  it("renders title and authors", () => {
    renderHeader(mockBook);

    expect(screen.getByText("Test Book Title")).toBeInTheDocument();
    expect(screen.getByText("Author One, Author Two")).toBeInTheDocument();
  });

  it("renders publisher, published_date, page_count, and ISBN", () => {
    renderHeader(mockBook);

    // All text values are present (some split across text nodes and spans)
    expect(screen.getByText("Test Publisher")).toBeInTheDocument();
    expect(screen.getByText("2024-01-15")).toBeInTheDocument();
    expect(screen.getByText("300")).toBeInTheDocument();
    expect(screen.getByText("9780123456789")).toBeInTheDocument();
    // Labels - use partial match since text is split
    expect(screen.getByText(/editorial/i)).toBeInTheDocument();
    expect(screen.getByText(/publicado/i)).toBeInTheDocument();
    expect(screen.getByText(/páginas/i)).toBeInTheDocument();
    expect(screen.getByText(/isbn/i)).toBeInTheDocument();
  });

  it("renders status badge with correct label", () => {
    renderHeader(mockBook);

    expect(screen.getByText("Leyendo")).toBeInTheDocument();
  });

  it("renders rating stars with correct fill", () => {
    renderHeader(mockBook);

    // The rating container has aria-label, stars are inside
    const ratingContainer = screen.getByLabelText("Rating: 4 de 5");
    const filledStars = ratingContainer.querySelectorAll(
      "svg.fill-amber-500, svg.fill-current",
    );
    expect(filledStars).toHaveLength(4);
  });

  it("renders correct status label for want_to_read", () => {
    const bookWantToRead = {
      ...mockBook,
      status: "want_to_read" as const,
      rating: null,
    };
    renderHeader(bookWantToRead);

    expect(screen.getByText("Quiero leer")).toBeInTheDocument();
    expect(screen.queryByLabelText(/rating/i)).not.toBeInTheDocument();
  });

  it("renders correct status label for read", () => {
    const bookRead = { ...mockBook, status: "read" as const };
    renderHeader(bookRead);

    expect(screen.getByText("Leído")).toBeInTheDocument();
  });

  it("pide confirmación antes de eliminar si confirmDeletions está activada", async () => {
    confirmState.confirmDeletions = true;
    const user = userEvent.setup();
    renderHeader(mockBook);

    // El trigger abre el diálogo; deleteBook aún no se llama.
    await user.click(screen.getByRole("button", { name: /eliminar libro/i }));
    expect(
      screen.getByText(/eliminar este libro y todas sus notas/i),
    ).toBeInTheDocument();
    expect(mockedDeleteBook).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /^eliminar$/i }));
    await waitFor(() => expect(mockedDeleteBook).toHaveBeenCalledTimes(1));
  });

  it("elimina directamente sin confirmación si confirmDeletions está desactivada", async () => {
    confirmState.confirmDeletions = false;
    const user = userEvent.setup();
    renderHeader(mockBook);

    await user.click(screen.getByRole("button", { name: /eliminar libro/i }));

    await waitFor(() => expect(mockedDeleteBook).toHaveBeenCalledTimes(1));
  });
});
