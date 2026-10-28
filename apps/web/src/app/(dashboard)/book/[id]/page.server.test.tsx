import { describe, expect, it, vi, beforeEach } from "vitest";

// Mocks del entorno server: `notFound` lanza un centinela (como Next.js) para
// detener el flujo y verificar la salida controlada.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(),
}));

vi.mock("@/lib/api/books", () => ({
  getBook: vi.fn(),
  getBookNotes: vi.fn(),
}));

import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { getBook, getBookNotes } from "@/lib/api/books";
import BookDetailPage from "./page";

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

const mockServerClient = {
  auth: {
    getUser: vi.fn(),
    getSession: vi.fn(),
  },
};

describe("BookDetailPage (Server Component)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createServerClient).mockReturnValue(mockServerClient as never);
    mockServerClient.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockServerClient.auth.getSession.mockResolvedValue({
      data: { session: { access_token: "token" } },
      error: null,
    });
  });

  it("deriva a notFound() cuando no hay usuario", async () => {
    mockServerClient.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    await expect(
      BookDetailPage({ params: Promise.resolve({ id: "book-1" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFound).toHaveBeenCalled();
  });

  it("deriva a notFound() cuando no hay sesión", async () => {
    mockServerClient.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    await expect(
      BookDetailPage({ params: Promise.resolve({ id: "book-1" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFound).toHaveBeenCalled();
  });

  it("deriva a notFound() cuando falla la carga de red", async () => {
    vi.mocked(getBook).mockRejectedValue(new Error("network down"));
    vi.mocked(getBookNotes).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      page_size: 50,
    });

    await expect(
      BookDetailPage({ params: Promise.resolve({ id: "book-1" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFound).toHaveBeenCalled();
  });

  it("deriva a notFound() cuando el libro no pertenece al usuario", async () => {
    vi.mocked(getBook).mockResolvedValue({
      ...mockBook,
      user_id: "other-user",
    });
    vi.mocked(getBookNotes).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      page_size: 50,
    });

    await expect(
      BookDetailPage({ params: Promise.resolve({ id: "book-1" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFound).toHaveBeenCalled();
  });

  it("renderiza el cliente con el libro y la primera página de notas", async () => {
    vi.mocked(getBook).mockResolvedValue(mockBook);
    vi.mocked(getBookNotes).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      page_size: 50,
    });

    const result = await BookDetailPage({
      params: Promise.resolve({ id: "book-1" }),
    });

    expect(notFound).not.toHaveBeenCalled();
    expect(result).toBeTruthy();
  });
});
