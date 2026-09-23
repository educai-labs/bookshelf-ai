import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BookSearchCombobox } from "@/components/search/BookSearchCombobox";
import { SUGGESTION_DEBOUNCE_MS } from "@/lib/hooks/useBookSuggestions";
import type { BookSuggestion } from "@/types/book";

vi.mock("@/contexts/SettingsContext", () => ({
  useSettings: () => ({ language: "es" }),
}));
vi.mock("@/lib/api/books", () => ({
  getBookSuggestions: vi.fn(),
}));

import { getBookSuggestions } from "@/lib/api/books";

const mockGet = vi.mocked(getBookSuggestions);

const BOOK_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function suggestion(
  source: BookSuggestion["source"],
  isbn13: string,
  title: string,
): BookSuggestion {
  return {
    source,
    book_id: source === "library" ? BOOK_ID : null,
    isbn13,
    title,
    authors: ["Autor"],
    cover_url: null,
    in_library: source === "library",
  };
}

function Harness(props: {
  onSelect: (item: BookSuggestion) => void;
  onApplyQuery: (value: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <BookSearchCombobox
      inputId="test-search"
      value={value}
      onValueChange={setValue}
      onSelect={props.onSelect}
      onApplyQuery={props.onApplyQuery}
      placeholder="Buscar título o autor..."
      ariaLabel="Buscar título o autor"
    />
  );
}

function renderCombobox() {
  const onSelect = vi.fn();
  const onApplyQuery = vi.fn();
  render(<Harness onSelect={onSelect} onApplyQuery={onApplyQuery} />);
  return { onSelect, onApplyQuery };
}

async function typeAndSettle(input: HTMLElement, text: string) {
  fireEvent.change(input, { target: { value: text } });
  act(() => {
    vi.advanceTimersByTime(SUGGESTION_DEBOUNCE_MS);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

describe("BookSearchCombobox", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockGet.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("expone los roles ARIA de combobox y abre el dropdown tras teclear", async () => {
    mockGet.mockResolvedValue({ query: "dun", limit: 8, items: [] });
    renderCombobox();

    const input = screen.getByRole("combobox");
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(input).toHaveAttribute("aria-autocomplete", "list");

    await typeAndSettle(input, "dun");

    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("suggestions-dropdown")).toBeInTheDocument();
  });

  it("navega con ↑/↓ y selecciona con Enter", async () => {
    mockGet.mockResolvedValue({
      query: "dun",
      limit: 8,
      items: [
        suggestion("library", "9780000000001", "Dune"),
        suggestion("catalog", "9780000000002", "Otro"),
      ],
    });
    const { onSelect } = renderCombobox();
    const input = screen.getByRole("combobox");

    await typeAndSettle(input, "dun");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveAttribute(
      "aria-activedescendant",
      "test-search-listbox-option-0",
    );

    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Dune", isbn13: "9780000000001" }),
    );
  });

  it("cierra el dropdown con Escape", async () => {
    mockGet.mockResolvedValue({ query: "dun", limit: 8, items: [] });
    renderCombobox();
    const input = screen.getByRole("combobox");

    await typeAndSettle(input, "dun");
    expect(input).toHaveAttribute("aria-expanded", "true");

    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("Enter sin selección aplica el texto como consulta", async () => {
    mockGet.mockResolvedValue({ query: "dun", limit: 8, items: [] });
    const { onApplyQuery } = renderCombobox();
    const input = screen.getByRole("combobox");

    await typeAndSettle(input, "dun");

    fireEvent.keyDown(input, { key: "Enter" });
    expect(onApplyQuery).toHaveBeenCalledWith("dun");
  });

  it("muestra el estado de carga durante el fetch", async () => {
    mockGet.mockReturnValue(new Promise(() => {})); // nunca resuelve
    renderCombobox();
    const input = screen.getByRole("combobox");

    fireEvent.change(input, { target: { value: "dun" } });
    act(() => {
      vi.advanceTimersByTime(SUGGESTION_DEBOUNCE_MS);
    });

    expect(screen.getByTestId("suggestions-loading")).toBeInTheDocument();
  });
});
