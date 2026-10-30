import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/books";
import { useBooks } from "./useBooks";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  supabase: { auth: { getSession: mocks.getSession } },
}));

function makeBooks(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `b${i}`,
    title: `Libro ${i}`,
    authors: ["Autor"],
    status: "reading" as const,
    rating: null,
    notes_count: 0,
    user_id: "u1",
    isbn13: `978000000000${String(i).padStart(2, "0")}`.slice(0, 13),
    cover_url: null,
    page_count: null,
    publisher: null,
    published_date: null,
    description: null,
    started_at: null,
    finished_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  }));
}

function okResponse(items: unknown[], total: number, page: number) {
  return {
    ok: true,
    json: async () => ({
      items,
      total,
      page,
      page_size: 20,
      total_pages: Math.ceil(total / 20),
    }),
  } as Response;
}

function errorResponse(status: number, body: Record<string, unknown> = {}) {
  return {
    ok: false,
    status,
    json: async () => body,
  } as Response;
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("useBooks (errores tipados, feature 028)", () => {
  beforeEach(() => {
    mocks.getSession.mockReset();
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: "test-token" } },
      error: null,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lanza un ApiError tipado con status/code en un 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        errorResponse(401, { code: "UNAUTHORIZED", message: "expired" }),
      ),
    );

    const { result } = renderHook(() => useBooks({ q: "" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect((result.current.error as ApiError).status).toBe(401);
    expect((result.current.error as ApiError).code).toBe("UNAUTHORIZED");
  });

  it("propaga un ApiError con status 500 en errores de servidor", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        errorResponse(500, { code: "INTERNAL", message: "down" }),
      ),
    );

    const { result } = renderHook(() => useBooks({ q: "" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect((result.current.error as ApiError).status).toBe(500);
  });

  it("retry vuelve a pedir los libros y limpia el error", async () => {
    let fail = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        fail
          ? errorResponse(500, { code: "INTERNAL", message: "down" })
          : okResponse([], 0, 1),
      ),
    );

    const { result } = renderHook(() => useBooks({ q: "" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.error).toBeTruthy());

    fail = false;
    await act(async () => {
      await result.current.retry();
    });

    await waitFor(() => expect(result.current.error).toBeNull());
  });

  it("distingue el error de paginación (loadMoreError) del error inicial", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call += 1;
        if (call === 2) {
          return errorResponse(500);
        }
        return okResponse(makeBooks(20), 25, 1);
      }),
    );

    const { result } = renderHook(() => useBooks({ q: "" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.books).toHaveLength(20));

    await act(async () => {
      await result.current.loadMore();
    });

    await waitFor(() => expect(result.current.loadMoreError).toBeTruthy());
    expect(result.current.error).toBeNull();
    expect(result.current.books).toHaveLength(20);
  });
});
