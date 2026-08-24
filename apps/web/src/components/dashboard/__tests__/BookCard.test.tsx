import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Book } from "@/types/book";
import { BookCard } from "../BookCard";

/** Libro dummy con todos los campos del modelo. */
function makeBook(overrides: Partial<Book> = {}): Book {
  return {
    id: "b1",
    user_id: "u1",
    isbn13: "9780306406157",
    title: "Clean Code",
    authors: ["Robert C. Martin"],
    cover_url: "https://example.com/cover.jpg",
    page_count: 464,
    publisher: "Prentice Hall",
    published_date: "2008-08-01",
    description: "Un libro sobre código limpio.",
    status: "reading",
    rating: 4,
    started_at: null,
    finished_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    notes_count: 0,
    ...overrides,
  };
}

describe("BookCard", () => {
  it("renders cover, title, author, status badge and rating stars", () => {
    render(<BookCard book={makeBook()} onClick={() => {}} />);

    // Portada: alt = título del libro.
    expect(screen.getByAltText("Clean Code")).toBeInTheDocument();
    // Título y autores.
    expect(screen.getByText("Clean Code")).toBeInTheDocument();
    expect(screen.getByText("Robert C. Martin")).toBeInTheDocument();
    // Badge status "reading" → "Leyendo".
    expect(screen.getByText("Leyendo")).toBeInTheDocument();
    // RatingStars readonly (role="img").
    expect(
      screen.getByRole("img", { name: "Rating: 4 de 5" }),
    ).toBeInTheDocument();
  });

  it("navigates on click", () => {
    const onClick = vi.fn();
    render(<BookCard book={makeBook()} onClick={onClick} />);

    fireEvent.click(screen.getByRole("button", { name: "Clean Code" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("activates with keyboard Enter", () => {
    const onClick = vi.fn();
    render(<BookCard book={makeBook()} onClick={onClick} />);

    fireEvent.keyDown(screen.getByRole("button", { name: "Clean Code" }), {
      key: "Enter",
    });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("falls back to the SVG placeholder when the cover errors", () => {
    render(<BookCard book={makeBook()} onClick={() => {}} />);

    const img = screen.getByAltText("Clean Code");
    fireEvent.error(img);

    expect(screen.getByTestId("cover-placeholder")).toBeInTheDocument();
    expect(screen.queryByAltText("Clean Code")).not.toBeInTheDocument();
  });

  it("shows the placeholder directly when there is no cover_url", () => {
    render(
      <BookCard book={makeBook({ cover_url: null })} onClick={() => {}} />,
    );

    expect(screen.getByTestId("cover-placeholder")).toBeInTheDocument();
  });

  it.each([
    ["want_to_read", "Quiero leer"],
    ["reading", "Leyendo"],
    ["read", "Leído"],
  ] as const)("maps status %s to badge label %s", (status, label) => {
    render(<BookCard book={makeBook({ status })} onClick={() => {}} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
