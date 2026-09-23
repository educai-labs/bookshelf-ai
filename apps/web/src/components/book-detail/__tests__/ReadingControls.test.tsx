import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster, toast } from "sonner";

// Mock UI components that don't exist yet - must be hoisted
vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children, open, onOpenChange }: any) => (
    <div data-testid="popover" data-open={open}>
      {typeof children === "function"
        ? children({ open, onOpenChange })
        : children}
    </div>
  ),
  PopoverTrigger: ({ children, asChild }: any) => (
    <div data-testid="popover-trigger">
      {asChild ? children : <>{children}</>}
    </div>
  ),
  PopoverContent: ({ children, className, align }: any) => (
    <div data-testid="popover-content" className={className} data-align={align}>
      {children}
    </div>
  ),
}));

vi.mock("@/components/ui/calendar", () => ({
  Calendar: ({ onSelect, selected, mode, disabled }: any) => {
    const ref = (el: HTMLDivElement | null) => {
      if (el) {
        (el as HTMLDivElement & { _disabled?: unknown })._disabled = disabled;
      }
    };
    return (
      <div
        ref={ref}
        data-testid="calendar"
        data-mode={mode}
        data-selected={selected?.toISOString()}
        data-disabled={typeof disabled === "boolean" ? disabled : undefined}
      >
        <button
          data-testid="calendar-today"
          onClick={() => onSelect?.(new Date())}
        >
          Today
        </button>
      </div>
    );
  },
}));

vi.mock("@/lib/api/books", () => ({
  updateBook: vi.fn(),
}));

// Preferencias controlables por test (feature 022).
const notifState = vi.hoisted(() => ({ errors: true }));

vi.mock("@/contexts/SettingsContext", () => ({
  useSettings: () => ({
    settings: {
      notifications: {
        errors: notifState.errors,
        vectorizationDone: true,
        recommendations: true,
        account: true,
      },
      reader: { confirmDeletions: true },
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

import { updateBook } from "@/lib/api/books";

// Import after mocks are hoisted
import { ReadingControls } from "../ReadingControls";

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

function renderControls(book = mockBook) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ReadingControls book={book} />
      <Toaster />
    </QueryClientProvider>,
  );
}

describe("ReadingControls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(updateBook).mockReset();
    vi.mocked(updateBook).mockResolvedValue({ ...mockBook, status: "reading" });
    notifState.errors = true;
  });

  it("renders status select with current status", () => {
    renderControls();

    expect(screen.getByText("Estado")).toBeInTheDocument();
    expect(screen.getByText("Quiero leer")).toBeInTheDocument();
  });

  it("calls updateBook mutation when status changes", async () => {
    const user = userEvent.setup();
    renderControls();

    // Open select and click "Leyendo"
    const selectTrigger = screen.getByRole("combobox");
    await user.click(selectTrigger);
    await user.click(screen.getByRole("option", { name: /leyendo/i }));

    await waitFor(() => {
      expect(updateBook).toHaveBeenCalledWith("book-1", { status: "reading" });
    });
  });

  it("renders rating stars", () => {
    renderControls();

    const stars = screen.getByRole("radiogroup", { name: /valoraci/i });
    expect(stars).toBeInTheDocument();
    expect(stars.querySelectorAll("button")).toHaveLength(5);
  });

  it("calls updateBook mutation when rating star is clicked", async () => {
    const user = userEvent.setup();
    renderControls();

    // Click the 3rd star (rating = 3)
    const stars = screen.getByRole("radiogroup", { name: /valoraci/i });
    const thirdStar = stars.querySelectorAll("button")[2];
    await user.click(thirdStar!);

    await waitFor(() => {
      expect(updateBook).toHaveBeenCalledWith("book-1", { rating: 3 });
    });
  });

  it("clears rating when clicking the same star", async () => {
    const user = userEvent.setup();
    const bookWithRating = { ...mockBook, rating: 3 };
    renderControls(bookWithRating);

    // Click the 3rd star again to clear
    const stars = screen.getByRole("radiogroup", { name: /valoraci/i });
    const thirdStar = stars.querySelectorAll("button")[2];
    await user.click(thirdStar!);

    await waitFor(() => {
      expect(updateBook).toHaveBeenCalledWith("book-1", { rating: null });
    });
  });

  it("shows started_at date picker when status is reading", async () => {
    const user = userEvent.setup();
    const bookReading = { ...mockBook, status: "reading" as const };
    renderControls(bookReading);

    // Should show "Fecha inicio" label
    expect(screen.getByText("Fecha inicio")).toBeInTheDocument();

    // Open date picker and select a date - find button by text
    const dateButton = screen.getByRole("button", {
      name: /seleccionar fecha/i,
    });
    await user.click(dateButton);

    // Select a date from calendar (today)
    const todayButton = screen.getByTestId("calendar-today");
    await user.click(todayButton);

    await waitFor(() => {
      expect(updateBook).toHaveBeenCalledWith("book-1", {
        started_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      });
    });
  });

  it("shows finished_at date picker when status is read", async () => {
    const user = userEvent.setup();
    const bookRead = {
      ...mockBook,
      status: "read" as const,
      started_at: "2024-01-01",
    };
    renderControls(bookRead);

    expect(screen.getByText("Fecha inicio")).toBeInTheDocument();
    expect(screen.getByText("Fecha fin")).toBeInTheDocument();
  });

  it("hides started_at and finished_at when status is want_to_read", () => {
    renderControls();

    expect(screen.queryByLabelText(/fecha inicio/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/fecha fin/i)).not.toBeInTheDocument();
  });

  it("disables controls while mutation is pending", async () => {
    let resolveMutation: (value: typeof mockBook) => void;
    const mutationPromise = new Promise<typeof mockBook>((resolve) => {
      resolveMutation = resolve;
    });
    vi.mocked(updateBook).mockReturnValue(mutationPromise);

    renderControls();

    const selectTrigger = screen.getByRole("combobox");
    expect(selectTrigger).not.toBeDisabled();

    // Trigger mutation
    fireEvent.click(selectTrigger);
    fireEvent.click(screen.getByRole("option", { name: /leyendo/i }));

    // Should be disabled while pending
    await waitFor(() => {
      expect(screen.getByRole("combobox")).toBeDisabled();
    });

    resolveMutation!({ ...mockBook, status: "reading" });
  });

  it("shows saving indicator while mutation is pending", async () => {
    let resolveMutation: (value: typeof mockBook) => void;
    const mutationPromise = new Promise<typeof mockBook>((resolve) => {
      resolveMutation = resolve;
    });
    vi.mocked(updateBook).mockReturnValue(mutationPromise);

    renderControls();

    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: /leyendo/i }));

    await waitFor(() => {
      expect(screen.getByText("Guardando...")).toBeInTheDocument();
    });

    resolveMutation!({ ...mockBook, status: "reading" });
  });

  it("reverts local state on mutation error", async () => {
    const user = userEvent.setup();
    vi.mocked(updateBook).mockRejectedValue(new Error("Network error"));

    const bookReading = { ...mockBook, status: "reading" as const };
    renderControls(bookReading);

    // Try to change status - find combobox by role
    const selectTrigger = screen.getByRole("combobox");
    await user.click(selectTrigger);
    await user.click(screen.getByRole("option", { name: /quiero leer/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/error al guardar los cambios: network error/i),
      ).toBeInTheDocument();
    });
  });

  it("no muestra toast de error si notifications.errors está desactivada", async () => {
    notifState.errors = false;
    const errorSpy = vi.spyOn(toast, "error").mockImplementation(() => "id");
    const user = userEvent.setup();
    vi.mocked(updateBook).mockRejectedValue(new Error("Network error"));

    const bookReading = { ...mockBook, status: "reading" as const };
    renderControls(bookReading);

    const selectTrigger = screen.getByRole("combobox");
    await user.click(selectTrigger);
    await user.click(screen.getByRole("option", { name: /quiero leer/i }));

    // `onError` se ejecuta (revierte el estado local a "Leyendo") pero, con la
    // preferencia desactivada, no emite toast de error.
    await waitFor(() => {
      expect(screen.getByRole("combobox")).toHaveTextContent(/leyendo/i);
    });
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("enforces minDate on finished_at (not before started_at)", async () => {
    const user = userEvent.setup();
    const bookRead = {
      ...mockBook,
      status: "read" as const,
      started_at: "2024-01-10",
    };
    renderControls(bookRead);

    // Find the "Fecha fin" button by text
    const dateButton = screen.getByRole("button", {
      name: /seleccionar fecha/i,
    });
    await user.click(dateButton);

    // There are two calendars; the second (Fecha fin) debe deshabilitar
    // fechas anteriores a started_at.
    const calendars = screen.getAllByTestId("calendar");
    expect(calendars).toHaveLength(2);

    const disabled = (calendars[1] as HTMLDivElement & { _disabled?: unknown })
      ._disabled;
    expect(disabled).toBeTypeOf("function");

    const matcher = disabled as (date: Date) => boolean;
    expect(matcher(new Date("2024-01-09"))).toBe(true);
    expect(matcher(new Date("2024-01-10"))).toBe(false);
    expect(matcher(new Date("2024-01-11"))).toBe(false);
  });
});
