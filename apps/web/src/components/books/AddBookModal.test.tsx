import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";

import { AddBookModal } from "./AddBookModal";

vi.mock("@/hooks/useAddBook", () => ({
  useAddBook: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({
  useSession: vi.fn(() => ({
    session: { access_token: "mock-token" } as any,
    user: { id: "test-user-id" } as any,
    isLoading: false,
  })),
}));

vi.mock("@/lib/api/books", () => ({
  lookupBook: vi.fn(),
  getBookSuggestions: vi.fn(),
}));

import { useAddBook } from "@/hooks/useAddBook";
import { getBookSuggestions, lookupBook } from "@/lib/api/books";

const mockLookup = vi.mocked(lookupBook);
const mockGetSuggestions = vi.mocked(getBookSuggestions);

let capturedOnClose: (() => void) | null = null;

const mockAddBook = {
  mutate: vi.fn(),
  isPending: false,
  reset: vi.fn(),
};

const mockLookupData = {
  cover_url: "https://example.com/cover.jpg",
  title: "Test Book",
  authors: ["Author One"],
  page_count: 300,
  publisher: "Test Publisher",
  published_date: "2024-01-15",
  description: "Test description",
};

function renderModal(props: Partial<Parameters<typeof AddBookModal>[0]> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const ui =
    props.open !== undefined ? (
      <AddBookModal
        open={props.open}
        onOpenChange={props.onOpenChange}
        initialIsbn={props.initialIsbn}
      />
    ) : (
      <AddBookModal>
        <button data-testid="trigger-button">+ Añadir libro</button>
      </AddBookModal>
    );

  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
      <Toaster />
    </QueryClientProvider>,
  );
}

describe("AddBookModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnClose = null;

    vi.mocked(useAddBook).mockImplementation((options) => {
      capturedOnClose = options?.onClose ?? null;
      return mockAddBook;
    });
    mockLookup.mockReset();
    mockGetSuggestions.mockReset();
    mockGetSuggestions.mockResolvedValue({ query: "", limit: 8, items: [] });
  });

  it("abre el modal al click en el trigger", async () => {
    renderModal();

    await userEvent.click(screen.getByTestId("trigger-button"));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("ISBN-13")).toBeInTheDocument();
  });

  it("manual ISBN: busca, muestra preview y guarda", async () => {
    const user = userEvent.setup();
    mockLookup.mockResolvedValue(mockLookupData);

    renderModal();
    await user.click(screen.getByTestId("trigger-button"));

    const input = screen.getByRole("combobox");
    await user.type(input, "9780123456789");

    const searchButton = screen.getByRole("button", { name: /buscar/i });
    expect(searchButton).toBeEnabled();

    await user.click(searchButton);

    await waitFor(() => {
      expect(screen.getByText("Test Book")).toBeInTheDocument();
      expect(screen.getByText("Author One")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /guardar libro/i }));

    await waitFor(() => {
      expect(mockAddBook.mutate).toHaveBeenCalledWith("9780123456789");
    });
  });

  it("deshabilita el botón buscar sin un ISBN-13 completo", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByTestId("trigger-button"));

    const input = screen.getByRole("combobox");
    await user.type(input, "abc");

    expect(screen.getByRole("button", { name: /buscar/i })).toBeDisabled();
  });

  it("seleccionar una sugerencia de catálogo carga la preview", async () => {
    const user = userEvent.setup();
    mockGetSuggestions.mockResolvedValue({
      query: "dun",
      limit: 8,
      items: [
        {
          source: "catalog",
          book_id: null,
          isbn13: "9780441172719",
          title: "Dune",
          authors: ["Frank Herbert"],
          cover_url: null,
          in_library: false,
        },
      ],
    });
    mockLookup.mockResolvedValue(mockLookupData);

    renderModal();
    await user.click(screen.getByTestId("trigger-button"));

    const input = screen.getByRole("combobox");
    await user.type(input, "dun");

    const option = await screen.findByRole("option", { name: /Dune/ });
    await user.click(option);

    await waitFor(() => {
      expect(mockLookup).toHaveBeenCalledWith(
        "9780441172719",
        expect.anything(),
      );
    });
    expect(await screen.findByText("Test Book")).toBeInTheDocument();
  });

  it("seleccionar una sugerencia de biblioteca marca 'Ya en tu biblioteca'", async () => {
    const user = userEvent.setup();
    mockGetSuggestions.mockResolvedValue({
      query: "dun",
      limit: 8,
      items: [
        {
          source: "library",
          book_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          isbn13: "9780441172719",
          title: "Dune",
          authors: ["Frank Herbert"],
          cover_url: null,
          in_library: true,
        },
      ],
    });

    renderModal();
    await user.click(screen.getByTestId("trigger-button"));

    const input = screen.getByRole("combobox");
    await user.type(input, "dun");

    const option = await screen.findByRole("option", { name: /Dune/ });
    await user.click(option);

    expect(screen.getByTestId("already-in-library")).toHaveTextContent(
      "Este libro ya está en tu biblioteca.",
    );
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it("Escape cierra el modal", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByTestId("trigger-button"));

    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("Escape con el dropdown abierto cierra solo el dropdown, no el modal", async () => {
    const user = userEvent.setup();
    mockGetSuggestions.mockResolvedValue({
      query: "dun",
      limit: 8,
      items: [
        {
          source: "catalog",
          book_id: null,
          isbn13: "9780441172719",
          title: "Dune",
          authors: ["Frank Herbert"],
          cover_url: null,
          in_library: false,
        },
      ],
    });

    renderModal();
    await user.click(screen.getByTestId("trigger-button"));

    const input = screen.getByRole("combobox");
    await user.type(input, "dun");

    // El dropdown se abre con las sugerencias.
    expect(
      await screen.findByRole("option", { name: /Dune/ }),
    ).toBeInTheDocument();

    await user.keyboard("{Escape}");

    // El modal sigue abierto y el dropdown se cierra.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole("option")).not.toBeInTheDocument();
    });

    // Un segundo Escape (dropdown ya cerrado) sí cierra el modal.
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("modo controlado con ISBN inicial ejecuta el lookup", async () => {
    mockLookup.mockResolvedValue(mockLookupData);

    renderModal({
      open: true,
      onOpenChange: vi.fn(),
      initialIsbn: "9780123456789",
    });

    await waitFor(() => {
      expect(mockLookup).toHaveBeenCalledWith(
        "9780123456789",
        expect.anything(),
      );
    });
    expect(await screen.findByText("Test Book")).toBeInTheDocument();
  });
});
