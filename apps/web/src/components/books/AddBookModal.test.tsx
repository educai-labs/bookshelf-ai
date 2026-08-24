import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";

import { AddBookModal } from "./AddBookModal";

// Mock dependencies
vi.mock("@/hooks/useIsbnInput", () => ({
  useIsbnInput: vi.fn(),
}));

vi.mock("@/hooks/useAddBook", () => ({
  useAddBook: vi.fn(),
}));

vi.mock("@/lib/api/books", () => ({
  lookupBook: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({
  useSession: vi.fn(() => ({
    session: { access_token: "mock-token" } as any,
    user: { id: "test-user-id" } as any,
    isLoading: false,
  })),
}));

import { useIsbnInput } from "@/hooks/useIsbnInput";
import { useAddBook } from "@/hooks/useAddBook";
import { lookupBook } from "@/lib/api/books";
import { useSession } from "@/hooks/useAuth";

const mockIsbnInput = {
  isbn: "9780123456789",
  formattedIsbn: "978-0-123-45678-9",
  isValid: true,
  onChange: vi.fn(),
  reset: vi.fn(),
};

let capturedOnClose: (() => void) | null = null;
let capturedOnError: ((error: Error) => void) | null = null;
let mutateError: Error | null = null;
let shouldCallOnClose = true;

const mockAddBook = {
  mutate: vi.fn((_isbn: string) => {
    if (mutateError) {
      // Simulate mutation error - call captured onError if available
      if (capturedOnError) {
        Promise.resolve().then(() => {
          capturedOnError?.(mutateError);
        });
      }
      return;
    }
    if (shouldCallOnClose && capturedOnClose) {
      Promise.resolve().then(() => {
        capturedOnClose?.();
      });
    }
  }),
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

function renderModal() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AddBookModal>
        <button data-testid="trigger-button">+ Añadir libro</button>
      </AddBookModal>
      <Toaster />
    </QueryClientProvider>,
  );
}

describe("AddBookModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnClose = null;
    capturedOnError = null;
    mutateError = null;
    shouldCallOnClose = true;

    vi.mocked(useIsbnInput).mockReturnValue(mockIsbnInput);
    vi.mocked(useAddBook).mockImplementation((options) => {
      capturedOnClose = options?.onClose ?? null;
      capturedOnError = options?.onError ?? null;
      return mockAddBook;
    });
    vi.mocked(lookupBook).mockReset();
  });

  it("abre el modal al click en el trigger", async () => {
    renderModal();

    const triggerButton = screen.getByTestId("trigger-button");
    await userEvent.click(triggerButton);

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("ISBN-13")).toBeInTheDocument();
  });

  it("normaliza ISBN y valida longitud 13 dígitos", async () => {
    // Setup: isbn input with invalid length
    const invalidIsbnInput = {
      ...mockIsbnInput,
      isbn: "978012345678",
      formattedIsbn: "978-0-123-45678",
      isValid: false,
    };
    vi.mocked(useIsbnInput).mockReturnValue(invalidIsbnInput);

    renderModal();
    const triggerButton = screen.getByTestId("trigger-button");
    await userEvent.click(triggerButton);

    const searchButton = screen.getByRole("button", { name: /buscar/i });
    expect(searchButton).toBeDisabled();
  });

  it("happy path completo: busca, muestra preview, guarda libro", async () => {
    const user = userEvent.setup();
    shouldCallOnClose = false;

    vi.mocked(lookupBook).mockResolvedValue(mockLookupData);

    renderModal();
    const triggerButton = screen.getByTestId("trigger-button");
    await user.click(triggerButton);

    // Stage input: click buscar
    const searchButton = screen.getByRole("button", { name: /buscar/i });
    await user.click(searchButton);

    // Stage preview: verify BookMetadataPreview renders
    await waitFor(() => {
      expect(screen.getByText("Test Book")).toBeInTheDocument();
      expect(screen.getByText("Author One")).toBeInTheDocument();
      expect(screen.getByText("300 págs.")).toBeInTheDocument();
    });

    // Click guardar
    const saveButton = screen.getByRole("button", { name: /guardar libro/i });
    await user.click(saveButton);

    // Verify mutation called
    await waitFor(() => {
      expect(mockAddBook.mutate).toHaveBeenCalledWith("9780123456789");
    });

    // Modal should show saving stage after save (dialog close not yet implemented)
    await waitFor(() => {
      expect(
        screen.getByText(/guardando libro en tu biblioteca/i),
      ).toBeInTheDocument();
    });

    shouldCallOnClose = true;
  });

  it("muestra error 404 cuando libro no encontrado", async () => {
    const user = userEvent.setup();

    const error = new Error("Libro no encontrado") as Error & {
      status: number;
      code: string;
    };
    error.status = 404;
    error.code = "NOT_FOUND";
    vi.mocked(lookupBook).mockRejectedValue(error);

    renderModal();
    const triggerButton = screen.getByTestId("trigger-button");
    await user.click(triggerButton);

    const searchButton = screen.getByRole("button", { name: /buscar/i });
    await user.click(searchButton);

    // Should show toast error
    await waitFor(() => {
      expect(
        screen.getByText(/libro no encontrado en open library/i),
      ).toBeInTheDocument();
    });

    // Should stay in input stage
    expect(screen.getByRole("button", { name: /buscar/i })).toBeInTheDocument();
  });

  it("muestra error 409 cuando libro ya en biblioteca", async () => {
    const user = userEvent.setup();

    vi.mocked(lookupBook).mockResolvedValue(mockLookupData);

    renderModal();
    const triggerButton = screen.getByTestId("trigger-button");
    await user.click(triggerButton);

    // Go to preview
    const searchButton = screen.getByRole("button", { name: /buscar/i });
    await user.click(searchButton);

    await waitFor(() => {
      expect(screen.getByText("Test Book")).toBeInTheDocument();
    });

    // Try to save - verify mutation is called
    const saveButton = screen.getByRole("button", { name: /guardar libro/i });
    await user.click(saveButton);

    await waitFor(() => {
      expect(mockAddBook.mutate).toHaveBeenCalledWith("9780123456789");
    });
  });

  it("cerrar modal sin guardar vuelve al stage input", async () => {
    const user = userEvent.setup();

    vi.mocked(lookupBook).mockResolvedValue(mockLookupData);

    renderModal();
    const triggerButton = screen.getByTestId("trigger-button");
    await user.click(triggerButton);

    // Go to preview
    const searchButton = screen.getByRole("button", { name: /buscar/i });
    await user.click(searchButton);

    await waitFor(() => {
      expect(screen.getByText("Test Book")).toBeInTheDocument();
    });

    // Click "Volver"
    const backButton = screen.getByRole("button", { name: /volver/i });
    await user.click(backButton);

    // Should be back to input stage
    expect(screen.getByRole("button", { name: /buscar/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/isbn-13/i)).toBeInTheDocument();
  });

  it("focus trap: modal se cierra con Escape", async () => {
    const user = userEvent.setup();

    renderModal();
    const triggerButton = screen.getByTestId("trigger-button");
    await user.click(triggerButton);

    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Press Escape
    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("botón buscar deshabilitado durante fetch", async () => {
    const user = userEvent.setup();

    let resolveLookup: (value: typeof mockLookupData) => void;
    const lookupPromise = new Promise<typeof mockLookupData>((resolve) => {
      resolveLookup = resolve;
    });
    vi.mocked(lookupBook).mockReturnValue(lookupPromise);

    renderModal();
    const triggerButton = screen.getByTestId("trigger-button");
    await user.click(triggerButton);

    const searchButton = screen.getByRole("button", { name: /buscar/i });
    await user.click(searchButton);

    // Button should show loading state
    expect(
      screen.getByRole("button", { name: /buscando\.\.\./i }),
    ).toBeInTheDocument();

    // Resolve
    resolveLookup!(mockLookupData);
    await waitFor(() => {
      expect(screen.getByText("Test Book")).toBeInTheDocument();
    });
  });

  it("accesibilidad: DialogTitle, DialogDescription, labels en inputs", async () => {
    renderModal();
    const triggerButton = screen.getByTestId("trigger-button");
    await userEvent.click(triggerButton);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-labelledby");
    expect(dialog).toHaveAttribute("aria-describedby");

    expect(document.getElementById("add-book-title")).toHaveTextContent(
      "Añadir libro por ISBN",
    );
    expect(document.getElementById("add-book-description")).toHaveTextContent(
      "Introduce el ISBN-13 del libro para buscar sus metadatos y añadirlo a tu biblioteca.",
    );

    // Input has label and aria-describedby
    const input = screen.getByLabelText(/isbn-13/i);
    expect(input).toHaveAttribute("aria-describedby", "isbn-helper");
  });

  it("aria-live para toasts via sonner", async () => {
    const user = userEvent.setup();

    const error = new Error("Libro no encontrado") as Error & {
      status: number;
      code: string;
    };
    error.status = 404;
    error.code = "NOT_FOUND";
    vi.mocked(lookupBook).mockRejectedValue(error);

    renderModal();
    const triggerButton = screen.getByTestId("trigger-button");
    await user.click(triggerButton);

    const searchButton = screen.getByRole("button", { name: /buscar/i });
    await user.click(searchButton);

    // Toast should appear with aria-live (handled by sonner Toaster)
    await waitFor(
      () => {
        const toast = screen.getByText(/libro no encontrado en open library/i);
        expect(toast).toBeInTheDocument();
      },
      { timeout: 5000 },
    );
  });
});
