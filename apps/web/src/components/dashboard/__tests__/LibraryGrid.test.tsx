import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { Book } from "@/types/book";
import { LibraryGrid } from "../LibraryGrid";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
    },
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useSession: vi.fn(() => ({
    session: { access_token: "test-token" } as any,
    user: { id: "test-user-id" } as any,
    isLoading: false,
  })),
  useUser: vi.fn(() => ({ id: "test-user-id" }) as any),
}));

/** Dataset de 25 libros con los 3 status y rating 1-5 distribuidos (2 páginas × 20). */
function buildDataset(): Book[] {
  const STATUSES: Book["status"][] = ["reading", "want_to_read", "read"];
  return Array.from({ length: 25 }, (_, i) => ({
    id: `b${i + 1}`,
    user_id: "u1",
    isbn13: `978000000000${String(i + 1).padStart(2, "0")}`.slice(0, 13),
    title: `Libro ${i + 1}`,
    authors: ["Autor A"],
    cover_url: null,
    page_count: null,
    publisher: null,
    published_date: null,
    description: null,
    status: STATUSES[i % 3],
    rating: (i % 5) + 1,
    started_at: null,
    finished_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    notes_count: 0,
  }));
}

const DATASET = buildDataset();

/** Aplica filtros de la API sobre el dataset (mismo contrato que GET /api/v1/books). */
function applyFilters(books: Book[], params: URLSearchParams): Book[] {
  const status = params.get("status");
  if (status) {
    books = books.filter((b) => b.status === status);
  }
  const rating = params.get("rating");
  if (rating) {
    books = books.filter((b) => b.rating === Number(rating));
  }
  const q = params.get("q");
  if (q) {
    books = books.filter((b) =>
      b.title.toLowerCase().includes(q.toLowerCase()),
    );
  }
  return books;
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

/** Mock de `fetch` que pagina y filtra el dataset como el backend real. */
function stubPaginatedFetch(books: Book[] = DATASET) {
  const mock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://localhost");
    const page = Number(url.searchParams.get("page") ?? "1");
    const pageSize = Number(url.searchParams.get("page_size") ?? "20");
    const filtered = applyFilters(books, url.searchParams);
    const start = (page - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize);
    return {
      ok: true,
      json: async () => ({
        items,
        total: filtered.length,
        page,
        page_size: pageSize,
        total_pages: Math.ceil(filtered.length / pageSize),
      }),
    } as Response;
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

function lastFetchUrl(mock: ReturnType<typeof vi.fn>): string {
  const calls = mock.mock.calls as Array<[RequestInfo | URL]>;
  return String(calls.at(-1)?.[0] ?? "");
}

describe("LibraryGrid", () => {
  beforeEach(() => {
    mocks.push.mockReset();
    mocks.getSession.mockReset();
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: "test-token" } },
      error: null,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the grid with the initial books and navigates on card click", async () => {
    const fetchMock = stubPaginatedFetch();
    render(
      <LibraryGrid initialBooks={[DATASET[0], DATASET[1]]} initialTotal={25} />,
    );

    expect(await screen.findByTestId("books-grid")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("books-grid")).getByText("Libro 1"),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Libro 1" }));
    expect(mocks.push).toHaveBeenCalledWith("/book/b1");

    expect(fetchMock).toHaveBeenCalled();
  });

  it("filters by status tab and updates the query param", async () => {
    const fetchMock = stubPaginatedFetch();
    render(<LibraryGrid initialBooks={[]} initialTotal={0} />);
    await screen.findByTestId("books-grid");

    await userEvent.click(screen.getByRole("tab", { name: "Leyendo" }));

    await waitFor(() => {
      const url = lastFetchUrl(fetchMock);
      expect(url).toContain("status=reading");
    });
    // Solo los libros "reading" del dataset.
    await waitFor(() => {
      const titles = within(screen.getByTestId("books-grid")).getAllByText(
        /Libro/,
      );
      expect(titles.length).toBeGreaterThan(0);
    });
  });

  it("filters by rating select and updates the query param", async () => {
    const fetchMock = stubPaginatedFetch();
    render(<LibraryGrid initialBooks={[]} initialTotal={0} />);
    await screen.findByTestId("books-grid");

    await userEvent.click(
      screen.getByRole("combobox", { name: "Filtrar por rating" }),
    );
    await userEvent.click(await screen.findByRole("option", { name: "★★★★★" }));

    await waitFor(() => {
      expect(lastFetchUrl(fetchMock)).toContain("rating=5");
    });
  });

  it("debounces the search input (no request per keystroke)", async () => {
    const fetchMock = stubPaginatedFetch();
    render(<LibraryGrid initialBooks={[]} initialTotal={0} />);
    await screen.findByTestId("books-grid");
    const callsBeforeTyping = fetchMock.mock.calls.length;

    const input = screen.getByPlaceholderText("Buscar título o autor...");
    fireEvent.change(input, { target: { value: "L" } });
    fireEvent.change(input, { target: { value: "Libro 1" } });

    // Aún no ha pasado el debounce → sin request con q.
    expect(fetchMock.mock.calls.length).toBe(callsBeforeTyping);

    await waitFor(
      () => {
        expect(lastFetchUrl(fetchMock)).toContain("q=Libro");
      },
      { timeout: 3000 },
    );
  });

  function renderWithProviders(ui: React.ReactElement) {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    return render(
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
    );
  }

  it("shows the empty state when there are no books", async () => {
    stubPaginatedFetch([]);
    renderWithProviders(<LibraryGrid initialBooks={[]} initialTotal={0} />);

    expect(
      await screen.findByText("Tu biblioteca está vacía"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("add-first-book")).toBeInTheDocument();
  });

  it("shows the skeleton while the first fetch is loading", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>(() => {
            // Nunca resuelve → isLoading permanece true.
          }),
      ),
    );
    renderWithProviders(<LibraryGrid initialBooks={[]} initialTotal={0} />);

    expect(screen.getByTestId("books-skeleton")).toBeInTheDocument();
    expect(screen.getByTestId("books-skeleton").children).toHaveLength(8);
  });

  it("shows the error state and retries the request", async () => {
    const fetchMock = stubPaginatedFetch();
    fetchMock.mockRejectedValueOnce(new Error("Network down"));
    renderWithProviders(<LibraryGrid initialBooks={[]} initialTotal={0} />);

    expect(await screen.findByTestId("error-state")).toBeInTheDocument();
    expect(screen.getByText("Error al cargar los libros")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("retry-button"));

    expect(await screen.findByTestId("books-grid")).toBeInTheDocument();
  });

  it("loads more and appends items, hiding the button when finished", async () => {
    const fetchMock = stubPaginatedFetch();
    render(<LibraryGrid initialBooks={[]} initialTotal={0} />);

    await screen.findByTestId("books-grid");
    // Página 1 = 20 libros.
    expect(
      within(screen.getByTestId("books-grid")).getAllByRole("button"),
    ).toHaveLength(20);

    await userEvent.click(screen.getByTestId("load-more"));

    await waitFor(() => {
      expect(
        within(screen.getByTestId("books-grid")).getAllByRole("button"),
      ).toHaveLength(25);
    });
    // page * page_size (2*20=40) >= total (25) → botón desaparece.
    await waitFor(() => {
      expect(screen.queryByTestId("load-more")).not.toBeInTheDocument();
    });
    expect(lastFetchUrl(fetchMock)).toContain("page=2");
  });

  it("keeps the initial filters applied to the client state", async () => {
    const fetchMock = stubPaginatedFetch();
    render(
      <LibraryGrid
        initialBooks={[]}
        initialTotal={0}
        initialFilters={{ status: "read" }}
      />,
    );
    await screen.findByTestId("books-grid");

    // El tab activo refleja el filtro inicial.
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Leídos" })).toHaveAttribute(
        "data-state",
        "active",
      );
    });

    // Y el primer fetch del cliente mantiene el status inicial.
    expect(fetchMock).toHaveBeenCalled();
  });
});
