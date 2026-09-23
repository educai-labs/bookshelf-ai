import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster, toast } from "sonner";
import { NoteEditor } from "../NoteEditor";

// Mock dependencies
vi.mock("@/lib/api/books", () => ({
  createNote: vi.fn(),
}));

vi.mock("@/utils/markdown", () => ({
  insertAtCursor: vi.fn(),
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

import { createNote } from "@/lib/api/books";
import { insertAtCursor } from "@/utils/markdown";

function renderEditor() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <NoteEditor bookId="book-1" />
      <Toaster />
    </QueryClientProvider>,
  );
}

describe("NoteEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createNote).mockReset();
    vi.mocked(insertAtCursor).mockReset();
    vi.mocked(createNote).mockResolvedValue({
      id: "note-1",
      book_id: "book-1",
      content: "Test note",
      content_html: "<p>Test note</p>",
      chunk_index: 0,
      created_at: "2024-01-01T00:00:00Z",
    });
    notifState.errors = true;
  });

  it("renders toolbar with markdown buttons", () => {
    renderEditor();

    expect(
      screen.getByRole("button", { name: /negrita/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /cursiva/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /código inline/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /enlace/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /encabezado/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /lista/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cita/i })).toBeInTheDocument();
  });

  it("renders textarea and preview tabs", () => {
    renderEditor();

    expect(screen.getByRole("tab", { name: /editar/i })).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /previsualización/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/escribe tu nota en markdown/i),
    ).toBeInTheDocument();
  });

  it("inserts markdown at cursor when toolbar button clicked", async () => {
    const user = userEvent.setup();
    renderEditor();

    const textarea = screen.getByPlaceholderText(
      /escribe tu nota en markdown/i,
    );
    await user.click(textarea);

    // Click bold button
    await user.click(screen.getByRole("button", { name: /negrita/i }));

    expect(insertAtCursor).toHaveBeenCalledWith(textarea, "**");
  });

  it("switches between edit and preview tabs", async () => {
    const user = userEvent.setup();
    renderEditor();

    // Default is edit tab
    expect(
      screen.getByRole("tabpanel", { name: /editar/i }),
    ).toBeInTheDocument();

    // Switch to preview
    await user.click(screen.getByRole("tab", { name: /previsualización/i }));
    expect(
      screen.getByRole("tabpanel", { name: /previsualización/i }),
    ).toBeInTheDocument();
  });

  it("shows preview content when typing in editor (debounced)", async () => {
    const user = userEvent.setup();
    renderEditor();

    const textarea = screen.getByPlaceholderText(
      /escribe tu nota en markdown/i,
    );
    await user.type(textarea, "# Hello World");

    // Wait for debounce (300ms) and switch to preview tab
    await user.click(screen.getByRole("tab", { name: /previsualización/i }));

    await waitFor(
      () => {
        // The preview renders HTML, so look for the heading content
        const previewPanel = screen.getByRole("tabpanel", {
          name: /previsualización/i,
        });
        expect(previewPanel).toHaveTextContent("Hello World");
      },
      { timeout: 1000 },
    );
  });

  it("calls createNote mutation when save button clicked", async () => {
    const user = userEvent.setup();
    renderEditor();

    const textarea = screen.getByPlaceholderText(
      /escribe tu nota en markdown/i,
    );
    await user.type(textarea, "Test note content");

    await user.click(screen.getByRole("button", { name: /guardar nota/i }));

    await waitFor(() => {
      expect(createNote).toHaveBeenCalledWith("book-1", {
        content: "Test note content",
      });
    });
  });

  it("clears textarea and shows toast on successful save", async () => {
    const user = userEvent.setup();
    renderEditor();

    const textarea = screen.getByPlaceholderText(
      /escribe tu nota en markdown/i,
    );
    await user.type(textarea, "Test note content");

    await user.click(screen.getByRole("button", { name: /guardar nota/i }));

    await waitFor(() => {
      expect(screen.getByText("Nota guardada")).toBeInTheDocument();
    });

    // Textarea should be cleared
    expect(textarea).toHaveValue("");
  });

  it("disables save button when content is empty", () => {
    renderEditor();

    const saveButton = screen.getByRole("button", { name: /guardar nota/i });
    expect(saveButton).toBeDisabled();
  });

  it("disables save button while mutation is pending", async () => {
    let resolveMutation: (value: any) => void;
    const mutationPromise = new Promise<any>((resolve) => {
      resolveMutation = resolve;
    });
    vi.mocked(createNote).mockReturnValue(mutationPromise);

    const user = userEvent.setup();
    renderEditor();

    const textarea = screen.getByPlaceholderText(
      /escribe tu nota en markdown/i,
    );
    await user.type(textarea, "Test note");

    await user.click(screen.getByRole("button", { name: /guardar nota/i }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /guardando\.\.\./i }),
      ).toBeInTheDocument();
    });

    resolveMutation!({
      id: "note-1",
      book_id: "book-1",
      content: "Test note",
      content_html: "<p>Test note</p>",
      chunk_index: 0,
      created_at: "2024-01-01T00:00:00Z",
    });
  });

  it("shows error toast on mutation failure", async () => {
    const user = userEvent.setup();
    vi.mocked(createNote).mockRejectedValue(new Error("Failed to create note"));

    renderEditor();

    const textarea = screen.getByPlaceholderText(
      /escribe tu nota en markdown/i,
    );
    await user.type(textarea, "Test note");

    await user.click(screen.getByRole("button", { name: /guardar nota/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/error al guardar: failed to create note/i),
      ).toBeInTheDocument();
    });
  });

  it("no muestra toast de error si notifications.errors está desactivada", async () => {
    notifState.errors = false;
    const errorSpy = vi.spyOn(toast, "error").mockImplementation(() => "id");
    const user = userEvent.setup();

    // Promesa diferida para controlar el momento del fallo (determinista).
    let rejectMutation: (err: Error) => void;
    vi.mocked(createNote).mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectMutation = reject;
      }),
    );

    renderEditor();

    const textarea = screen.getByPlaceholderText(
      /escribe tu nota en markdown/i,
    );
    await user.type(textarea, "Test note");
    await user.click(screen.getByRole("button", { name: /guardar nota/i }));

    // Pendiente → botón "Guardando...".
    expect(
      screen.getByRole("button", { name: /guardando/i }),
    ).toBeInTheDocument();

    rejectMutation!(new Error("Failed to create note"));

    // `onError` se ejecuta (vuelve a "Guardar nota") pero sin toast.
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /guardar nota/i }),
      ).toBeInTheDocument();
    });
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("renders sanitized HTML in preview (removes script tags)", async () => {
    const user = userEvent.setup();
    renderEditor();

    const textarea = screen.getByPlaceholderText(
      /escribe tu nota en markdown/i,
    );
    await user.type(textarea, "<script>alert('xss')</script>Safe content");

    // Switch to preview tab
    await user.click(screen.getByRole("tab", { name: /previsualización/i }));

    // Wait for debounce and sanitization
    await waitFor(
      () => {
        const previewContent = screen.getByRole("tabpanel", {
          name: /previsualización/i,
        });
        expect(previewContent.textContent).not.toContain("<script>");
        expect(previewContent.textContent).toContain("Safe content");
      },
      { timeout: 1000 },
    );
  });
});
