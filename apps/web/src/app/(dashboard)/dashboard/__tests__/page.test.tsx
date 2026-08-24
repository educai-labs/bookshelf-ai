import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ReactElement } from "react";
import type { Book } from "@/types/book";
import DashboardPage from "../page";

// Mocks hoisted: el factory de vi.mock se ejecuta antes de la inicialización
// del cuerpo del archivo (evita TDZ).
const mocks = vi.hoisted(() => {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    gte: vi.fn(),
    ilike: vi.fn(),
    range: vi.fn(),
  };
  return {
    chain,
    clientMock: {
      auth: { getUser: vi.fn() },
      from: vi.fn(),
    },
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => mocks.clientMock,
}));

interface LibraryGridProps {
  initialBooks: Book[];
  initialTotal: number;
  initialFilters?: { status?: Book["status"]; rating_min?: number; q?: string };
}

function resetChain(rows: Array<Record<string, unknown>>, count: number) {
  mocks.chain.select.mockReset().mockReturnThis();
  mocks.chain.eq.mockReset().mockReturnThis();
  mocks.chain.gte.mockReset().mockReturnThis();
  mocks.chain.ilike.mockReset().mockReturnThis();
  mocks.chain.range
    .mockReset()
    .mockResolvedValue({ data: rows, count, error: null });
  mocks.clientMock.from.mockReset().mockReturnValue(mocks.chain);
}

/** Fila DB con el agregado `book_notes(count)` tal como lo devuelve Supabase. */
function makeRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
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
    book_notes: [{ count: 2 }],
    ...overrides,
  };
}

describe("DashboardPage (Server Component)", () => {
  beforeEach(() => {
    mocks.clientMock.auth.getUser.mockReset();
  });

  it("fetches the initial books with the correct supabase query and filters", async () => {
    const row = makeRow();
    resetChain([row], 1);
    mocks.clientMock.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "ana@example.com" } },
      error: null,
    });

    const element = (await DashboardPage()) as ReactElement<LibraryGridProps>;

    // getUser (server) para obtener el user_id.
    expect(mocks.clientMock.auth.getUser).toHaveBeenCalledTimes(1);

    // from("books").select("*, book_notes(count)", { count: "exact" })
    expect(mocks.clientMock.from).toHaveBeenCalledWith("books");
    expect(mocks.chain.select).toHaveBeenCalledWith("*, book_notes(count)", {
      count: "exact",
    });

    // Filtro de propiedad por user_id siempre presente.
    expect(mocks.chain.eq).toHaveBeenCalledWith("user_id", "u1");
    // Filtros default: sin status, sin rating_min, q vacío → no se aplican.
    expect(mocks.chain.gte).not.toHaveBeenCalled();
    expect(mocks.chain.ilike).not.toHaveBeenCalled();

    // Primera página: range(0, pageSize - 1) = range(0, 19).
    expect(mocks.chain.range).toHaveBeenCalledWith(0, 19);

    // Seed pasado a LibraryGrid.
    expect(element.props.initialBooks).toHaveLength(1);
    expect(element.props.initialBooks[0].id).toBe("b1");
    expect(element.props.initialBooks[0].notes_count).toBe(2);
    expect(element.props.initialTotal).toBe(1);
    expect(element.props.initialFilters).toEqual({ q: "" });
  });

  it("returns empty seed when the user is not authenticated", async () => {
    resetChain([], 0);
    mocks.clientMock.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const element = (await DashboardPage()) as ReactElement<LibraryGridProps>;

    expect(element.props.initialBooks).toEqual([]);
    expect(element.props.initialTotal).toBe(0);
    // Sin usuario → no se consulta la tabla.
    expect(mocks.clientMock.from).not.toHaveBeenCalled();
  });
});
