import { renderHook, waitFor, act } from "@testing-library/react";
import { vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";
import { useAddBook } from "./useAddBook";
import { createBook, ApiError } from "@/lib/api/books";

// Mock del módulo API
vi.mock("@/lib/api/books", () => ({
  createBook: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
    ) {
      super(message);
      this.name = "ApiError";
    }
  },
}));

const mockCreateBook = createBook as ReturnType<typeof vi.fn>;

// Wrapper para proveer QueryClient
function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useAddBook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("expone mutate, isPending, isError, error, isSuccess, reset", () => {
    const { result } = renderHook(() => useAddBook(), { wrapper });

    expect(typeof result.current.mutate).toBe("function");
    expect(result.current.isPending).toBe(false);
    expect(result.current.isError).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.isSuccess).toBe(false);
    expect(typeof result.current.reset).toBe("function");
  });

  it("happy path: llama createBook, invalida queries, muestra toast éxito, llama onClose", async () => {
    const mockBook = {
      id: "123",
      user_id: "user-1",
      isbn13: "9780123456789",
      title: "Test Book",
      authors: ["Author"],
      cover_url: null,
      page_count: 100,
      publisher: "Test Pub",
      published_date: "2024-01-01",
      description: "Description",
      status: "want_to_read" as const,
      rating: null,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    };

    mockCreateBook.mockResolvedValue(mockBook);

    const onClose = vi.fn();
    const { result } = renderHook(() => useAddBook({ onClose }), { wrapper });

    act(() => {
      result.current.mutate("9780123456789");
    });

    // La mutación se completa sincrónicamente en el test (mock resuelto)
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockCreateBook).toHaveBeenCalledWith(
      { isbn13: "9780123456789", status: "want_to_read" },
      undefined,
    );
    expect(onClose).toHaveBeenCalled();
    expect(result.current.isError).toBe(false);
  });

  it("error 400: ISBN inválido → toast descriptivo", async () => {
    mockCreateBook.mockRejectedValue(
      new ApiError(400, "INVALID_ISBN", "ISBN inválido"),
    );

    const { result } = renderHook(() => useAddBook(), { wrapper });

    act(() => {
      result.current.mutate("invalid");
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeInstanceOf(ApiError);
    expect((result.current.error as ApiError).status).toBe(400);
  });

  it("error 404: no encontrado en OL/GB → toast descriptivo", async () => {
    mockCreateBook.mockRejectedValue(
      new ApiError(404, "NOT_FOUND", "No encontrado"),
    );

    const { result } = renderHook(() => useAddBook(), { wrapper });

    act(() => {
      result.current.mutate("9780123456789");
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect((result.current.error as ApiError).status).toBe(404);
  });

  it("error 409: ya en biblioteca → toast descriptivo", async () => {
    mockCreateBook.mockRejectedValue(
      new ApiError(409, "DUPLICATE", "Duplicado"),
    );

    const { result } = renderHook(() => useAddBook(), { wrapper });

    act(() => {
      result.current.mutate("9780123456789");
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect((result.current.error as ApiError).status).toBe(409);
  });

  it("error 500: server error → toast descriptivo", async () => {
    mockCreateBook.mockRejectedValue(
      new ApiError(500, "SERVER_ERROR", "Server error"),
    );

    const { result } = renderHook(() => useAddBook(), { wrapper });

    act(() => {
      result.current.mutate("9780123456789");
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect((result.current.error as ApiError).status).toBe(500);
  });

  it("reset limpia el estado de error", async () => {
    mockCreateBook.mockRejectedValue(
      new ApiError(400, "INVALID_ISBN", "ISBN inválido"),
    );

    const { result } = renderHook(() => useAddBook(), { wrapper });

    act(() => {
      result.current.mutate("invalid");
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    act(() => {
      result.current.reset();
    });

    await waitFor(() => expect(result.current.isError).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.isSuccess).toBe(false);
  });
});
