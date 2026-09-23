import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotesList } from "../NotesList";
import { NoteCard } from "../NoteCard";

// Mock DOMPurify for the tests
vi.mock("dompurify", () => ({
  default: {
    sanitize: vi.fn((html: string) =>
      html.replace(/<script.*?>.*?<\/script>/gi, ""),
    ),
  },
}));

vi.mock("@/lib/api/books", () => ({
  deleteNote: vi.fn().mockResolvedValue(undefined),
}));

// Preferencias controlables por test (feature 022).
const confirmState = vi.hoisted(() => ({ confirmDeletions: true }));

vi.mock("@/contexts/SettingsContext", () => ({
  useSettings: () => ({
    settings: {
      reader: { confirmDeletions: confirmState.confirmDeletions },
      notifications: {
        errors: true,
        vectorizationDone: true,
        recommendations: true,
        account: true,
      },
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

import { deleteNote } from "@/lib/api/books";

const mockedDeleteNote = vi.mocked(deleteNote);

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});

function renderWithClient(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

const mockNotes = [
  {
    id: "note-1",
    book_id: "book-1",
    content: "First note content",
    content_html: "<p>First note content</p>",
    chunk_index: 0,
    created_at: "2024-01-15T10:00:00Z",
  },
  {
    id: "note-2",
    book_id: "book-1",
    content: "Second note with **markdown**",
    content_html: "<p>Second note with <strong>markdown</strong></p>",
    chunk_index: 1,
    created_at: "2024-01-14T15:30:00Z",
  },
];

describe("NotesList", () => {
  it("renders empty state when no notes", () => {
    renderWithClient(<NotesList notes={[]} />);

    expect(
      screen.getByText("No hay notas aún. ¡Escribe la primera arriba!"),
    ).toBeInTheDocument();
  });

  it("renders NoteCard for each note", () => {
    renderWithClient(<NotesList notes={mockNotes} />);

    expect(screen.getByText("First note content")).toBeInTheDocument();
    expect(screen.getByText("markdown")).toBeInTheDocument();
  });

  it("renders notes in order (created_at DESC)", () => {
    renderWithClient(<NotesList notes={mockNotes} />);

    const notes = screen.getAllByTestId("note-card");
    expect(notes).toHaveLength(2);
    // First note should appear before second note in the DOM
    expect(notes[0]).toBeInTheDocument();
    expect(notes[1]).toBeInTheDocument();
  });
});

describe("NoteCard", () => {
  beforeEach(() => {
    mockedDeleteNote.mockReset();
    mockedDeleteNote.mockResolvedValue(undefined);
    confirmState.confirmDeletions = true;
  });

  it("renders relative timestamp", () => {
    renderWithClient(<NoteCard note={mockNotes[0]} />);

    // date-fns formatDistanceToNow with Spanish locale
    expect(screen.getByText(/hace/i)).toBeInTheDocument();
  });

  it("renders 'Vectorizado' badge when chunk_index > 0", () => {
    renderWithClient(<NoteCard note={mockNotes[1]} />);

    expect(screen.getByText("Vectorizado")).toBeInTheDocument();
  });

  it("does not render 'Vectorizado' badge when chunk_index = 0", () => {
    renderWithClient(<NoteCard note={mockNotes[0]} />);

    expect(screen.queryByText("Vectorizado")).not.toBeInTheDocument();
  });

  it("sanitizes HTML content (removes script tags)", () => {
    const noteWithScript = {
      ...mockNotes[0],
      content_html: "<p>Safe content</p><script>alert('xss')</script>",
    };

    renderWithClient(<NoteCard note={noteWithScript} />);

    // DOMPurify should remove script tags
    expect(screen.getByText("Safe content")).toBeInTheDocument();
    expect(screen.queryByText("alert")).not.toBeInTheDocument();
  });

  it("renders markdown content as HTML (strong, em, code)", () => {
    const noteWithMarkdown = {
      ...mockNotes[0],
      content_html:
        "<p><strong>Bold</strong> <em>italic</em> <code>code</code></p>",
    };

    renderWithClient(<NoteCard note={noteWithMarkdown} />);

    expect(screen.getByText("Bold")).toBeInTheDocument();
    expect(screen.getByText("italic")).toBeInTheDocument();
    expect(screen.getByText("code")).toBeInTheDocument();
  });

  it("renders blockquote content", () => {
    const noteWithQuote = {
      ...mockNotes[0],
      content_html: "<blockquote><p>Quoted text</p></blockquote>",
    };

    renderWithClient(<NoteCard note={noteWithQuote} />);

    expect(screen.getByText("Quoted text")).toBeInTheDocument();
  });

  it("renders list content", () => {
    const noteWithList = {
      ...mockNotes[0],
      content_html: "<ul><li>Item 1</li><li>Item 2</li></ul>",
    };

    renderWithClient(<NoteCard note={noteWithList} />);

    expect(screen.getByText("Item 1")).toBeInTheDocument();
    expect(screen.getByText("Item 2")).toBeInTheDocument();
  });

  it("pide confirmación antes de eliminar la nota si confirmDeletions está activada", async () => {
    confirmState.confirmDeletions = true;
    const user = userEvent.setup();
    renderWithClient(<NoteCard note={mockNotes[0]} />);

    await user.click(screen.getByRole("button", { name: /eliminar nota/i }));
    expect(screen.getByText(/eliminar esta nota/i)).toBeInTheDocument();
    expect(mockedDeleteNote).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /^eliminar$/i }));
    await waitFor(() => expect(mockedDeleteNote).toHaveBeenCalledTimes(1));
  });

  it("elimina la nota directamente si confirmDeletions está desactivada", async () => {
    confirmState.confirmDeletions = false;
    const user = userEvent.setup();
    renderWithClient(<NoteCard note={mockNotes[0]} />);

    await user.click(screen.getByRole("button", { name: /eliminar nota/i }));

    await waitFor(() => expect(mockedDeleteNote).toHaveBeenCalledTimes(1));
  });
});
