import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SuggestionsDropdown } from "@/components/search/SuggestionsDropdown";
import type { BookSuggestion } from "@/types/book";

vi.mock("@/contexts/SettingsContext", () => ({
  useSettings: () => ({ language: "es" }),
}));

const BOOK_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function librarySuggestion(isbn13: string, title: string): BookSuggestion {
  return {
    source: "library",
    book_id: BOOK_ID,
    isbn13,
    title,
    authors: ["Autor Uno"],
    cover_url: null,
    in_library: true,
  };
}

function catalogSuggestion(isbn13: string, title: string): BookSuggestion {
  return {
    source: "catalog",
    book_id: null,
    isbn13,
    title,
    authors: ["Autor Dos"],
    cover_url: "https://covers.openlibrary.org/b/id/1-M.jpg",
    in_library: false,
  };
}

function renderDropdown(
  props: Partial<Parameters<typeof SuggestionsDropdown>[0]>,
) {
  return render(
    <SuggestionsDropdown
      items={[]}
      isLoading={false}
      query="harry"
      activeIndex={-1}
      listboxId="test-listbox"
      onSelect={vi.fn()}
      onMouseEnter={vi.fn()}
      listRef={{ current: null }}
      {...props}
    />,
  );
}

describe("SuggestionsDropdown", () => {
  it("muestra el estado de carga", () => {
    renderDropdown({ isLoading: true });

    expect(screen.getByTestId("suggestions-loading")).toBeInTheDocument();
    expect(screen.getByTestId("suggestions-loading")).toHaveAttribute(
      "aria-label",
      "Cargando sugerencias",
    );
  });

  it("muestra el estado vacío con la consulta", () => {
    renderDropdown({ items: [], query: "harry" });

    expect(screen.getByTestId("suggestions-empty")).toBeInTheDocument();
    expect(screen.getByText("Sin resultados para 'harry'")).toBeInTheDocument();
  });

  it("renderiza la lista con roles de option y badge de biblioteca", () => {
    renderDropdown({
      items: [
        librarySuggestion("9780000000001", "Dune"),
        catalogSuggestion("9780000000002", "Otro Libro"),
      ],
    });

    const listbox = screen.getByRole("listbox");
    expect(listbox).toHaveAttribute("id", "test-listbox");

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveAttribute("aria-selected", "false");
    expect(options[0]).toHaveTextContent("Dune");
    expect(options[0]).toHaveTextContent("En tu biblioteca");
    expect(options[1]).toHaveTextContent("Otro Libro");
  });

  it("renderiza portadas con alt y fallback placeholder", () => {
    renderDropdown({
      items: [
        librarySuggestion("9780000000001", "Dune"),
        catalogSuggestion("9780000000002", "Con Portada"),
      ],
    });

    // Sin portada → placeholder (role="img" + aria-label).
    const placeholder = screen.getAllByRole("img", {
      name: "Sin portada disponible",
    });
    expect(placeholder.length).toBeGreaterThanOrEqual(1);

    // Con portada → <Image alt="Portada de Con Portada">.
    expect(screen.getByAltText("Portada de Con Portada")).toBeInTheDocument();
  });

  it("marca la opción activa con aria-selected", () => {
    renderDropdown({
      items: [librarySuggestion("9780000000001", "Dune")],
      activeIndex: 0,
    });

    expect(screen.getByRole("option")).toHaveAttribute("aria-selected", "true");
  });
});
