import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SUGGESTION_DEBOUNCE_MS,
  useBookSuggestions,
} from "@/lib/hooks/useBookSuggestions";
import type { BookSuggestion, SuggestionsResponse } from "@/types/book";

vi.mock("@/lib/api/books", () => ({
  getBookSuggestions: vi.fn(),
}));

import { getBookSuggestions } from "@/lib/api/books";

const mockGet = vi.mocked(getBookSuggestions);

const BOOK_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function libSuggestion(isbn13: string, title: string): BookSuggestion {
  return {
    source: "library",
    book_id: BOOK_ID,
    isbn13,
    title,
    authors: [],
    cover_url: null,
    in_library: true,
  };
}

function response(items: BookSuggestion[]): SuggestionsResponse {
  return { query: "x", limit: 8, items };
}

describe("useBookSuggestions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockGet.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("no hace fetch con menos de 3 caracteres (umbral)", () => {
    const { result } = renderHook(() => useBookSuggestions("ab"));
    act(() => {
      vi.advanceTimersByTime(SUGGESTION_DEBOUNCE_MS);
    });

    expect(mockGet).not.toHaveBeenCalled();
    expect(result.current.hasMinChars).toBe(false);
    expect(result.current.suggestions).toEqual([]);
  });

  it("hace fetch tras el debounce con 3 o más caracteres", async () => {
    mockGet.mockResolvedValue(
      response([libSuggestion("9780000000001", "Dune")]),
    );

    const { result } = renderHook(() => useBookSuggestions("dun"));
    act(() => {
      vi.advanceTimersByTime(SUGGESTION_DEBOUNCE_MS);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith("dun", 8, expect.any(AbortSignal));
    expect(result.current.suggestions).toHaveLength(1);
    expect(result.current.suggestions[0].title).toBe("Dune");
    expect(result.current.error).toBeNull();
  });

  it("debounce: una única petición por pausa con la consulta final", async () => {
    mockGet.mockResolvedValue(response([]));

    const { rerender } = renderHook(
      ({ q }: { q: string }) => useBookSuggestions(q),
      { initialProps: { q: "" } },
    );
    rerender({ q: "gua" });
    rerender({ q: "guas" });
    rerender({ q: "guaso" });

    act(() => {
      vi.advanceTimersByTime(SUGGESTION_DEBOUNCE_MS);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith("guaso", 8, expect.any(AbortSignal));
  });

  it("descarta respuestas obsoletas (fuera de orden)", async () => {
    let resolveFirst!: (value: SuggestionsResponse) => void;
    const firstPromise = new Promise<SuggestionsResponse>((resolve) => {
      resolveFirst = resolve;
    });
    mockGet
      .mockImplementationOnce(() => firstPromise)
      .mockResolvedValueOnce(
        response([libSuggestion("9780000000002", "Nueva")]),
      );

    const { rerender, result } = renderHook(
      ({ q }: { q: string }) => useBookSuggestions(q),
      { initialProps: { q: "vieja" } },
    );
    act(() => {
      vi.advanceTimersByTime(SUGGESTION_DEBOUNCE_MS);
    });

    rerender({ q: "nueva" });
    act(() => {
      vi.advanceTimersByTime(SUGGESTION_DEBOUNCE_MS);
    });
    await act(async () => {
      await Promise.resolve();
    });

    // La segunda petición ya resolvió con "Nueva".
    expect(result.current.suggestions[0]?.title).toBe("Nueva");

    // La primera (obsoleta) resuelve después y debe descartarse.
    resolveFirst(response([libSuggestion("9780000000003", "Vieja")]));
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.suggestions[0]?.title).toBe("Nueva");
    expect(result.current.suggestions).toHaveLength(1);
  });

  it("expone el error de forma recuperable", async () => {
    mockGet.mockRejectedValue(new Error("red caída"));

    const { result } = renderHook(() => useBookSuggestions("dun"));
    act(() => {
      vi.advanceTimersByTime(SUGGESTION_DEBOUNCE_MS);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.suggestions).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });
});
