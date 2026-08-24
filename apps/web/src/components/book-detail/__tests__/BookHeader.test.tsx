import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BookHeader } from "../BookHeader";

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
  it("renders cover image with priority (fetchpriority=high) and correct aspect ratio", () => {
    render(<BookHeader book={mockBook} />);

    const img = screen.getByAltText("Portada de Test Book Title");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("fetchpriority", "high");
    // Next.js Image renders as img with data-nimg="fill" for fill layout
    expect(img).toHaveAttribute("data-nimg", "fill");
  });

  it("renders fallback when no cover_url", () => {
    const bookNoCover = { ...mockBook, cover_url: null };
    render(<BookHeader book={bookNoCover} />);

    expect(screen.getByText("Sin portada")).toBeInTheDocument();
  });

  it("renders title and authors", () => {
    render(<BookHeader book={mockBook} />);

    expect(screen.getByText("Test Book Title")).toBeInTheDocument();
    expect(screen.getByText("Author One, Author Two")).toBeInTheDocument();
  });

  it("renders publisher, published_date, page_count, and ISBN", () => {
    render(<BookHeader book={mockBook} />);

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
    render(<BookHeader book={mockBook} />);

    expect(screen.getByText("Leyendo")).toBeInTheDocument();
  });

  it("renders rating stars with correct fill", () => {
    render(<BookHeader book={mockBook} />);

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
    render(<BookHeader book={bookWantToRead} />);

    expect(screen.getByText("Por leer")).toBeInTheDocument();
    expect(screen.queryByLabelText(/rating/i)).not.toBeInTheDocument();
  });

  it("renders correct status label for read", () => {
    const bookRead = { ...mockBook, status: "read" as const };
    render(<BookHeader book={bookRead} />);

    expect(screen.getByText("Leído")).toBeInTheDocument();
  });
});
