// Cliente API para libros (feature 014, 013, 015).
// Llamadas a `/api/v1/books/*` con autenticación Supabase (Bearer token).

import { supabase } from "@/lib/supabase/client";
import { suggestionsResponseSchema } from "@/lib/validations/suggestions";
import type {
  BookLookupResponse,
  BookCreateRequest,
  BookResponse,
  Book,
  BookUpdateRequest,
  Note,
  NoteCreateRequest,
  PaginatedNotes,
  SuggestionsResponse,
} from "@/types/book";

/** Error tipado devuelto por la API. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Headers comunes con token de acceso. */
async function authHeaders(
  session?: { access_token: string } | null,
): Promise<Record<string, string>> {
  if (session?.access_token) {
    return { Authorization: `Bearer ${session.access_token}` };
  }
  // Fallback: try to get session directly (for backward compat)
  const {
    data: { session: directSession },
  } = await supabase.auth.getSession();
  return directSession?.access_token
    ? { Authorization: `Bearer ${directSession.access_token}` }
    : {};
}

/**
 * `GET /api/v1/books/lookup?isbn=...`
 * Busca metadatos de un libro por ISBN-13 (Open Library / Google Books).
 */
export async function lookupBook(
  isbn13: string,
  session?: { access_token: string } | null,
): Promise<BookLookupResponse> {
  const headers = await authHeaders(session);
  const res = await fetch(
    `/api/v1/books/lookup?isbn=${encodeURIComponent(isbn13)}`,
    {
      headers,
    },
  );

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new ApiError(
      res.status,
      errorData.code ?? "LOOKUP_FAILED",
      errorData.message ?? "No se pudo buscar el libro",
    );
  }

  return (await res.json()) as BookLookupResponse;
}

/**
 * `POST /api/v1/books`
 * Crea un libro en la biblioteca del usuario.
 */
export async function createBook(
  payload: BookCreateRequest,
  session?: { access_token: string } | null,
): Promise<BookResponse> {
  const headers = await authHeaders(session);
  const res = await fetch("/api/v1/books", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new ApiError(
      res.status,
      errorData.code ?? "CREATE_FAILED",
      errorData.message ?? "No se pudo crear el libro",
    );
  }

  return (await res.json()) as BookResponse;
}

// ============================================================
// Feature 015: Book Detail / Reading Sheet
// ============================================================

/** Re-export Note type for consumers. */
export type { Note } from "@/types/book";

/**
 * `GET /api/v1/books/{id}`
 * Obtiene un libro por ID (con notes_count).
 */
export async function getBook(id: string): Promise<Book> {
  const headers = await authHeaders();
  const res = await fetch(`/api/v1/books/${id}`, { headers });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new ApiError(
      res.status,
      errorData.code ?? "GET_BOOK_FAILED",
      errorData.message ?? "No se pudo obtener el libro",
    );
  }

  return (await res.json()) as Book;
}

/**
 * `PATCH /api/v1/books/{id}`
 * Actualiza campos editables de un libro (status, rating, started_at, finished_at).
 */
export async function updateBook(
  id: string,
  data: BookUpdateRequest,
): Promise<Book> {
  const headers = await authHeaders();
  const res = await fetch(`/api/v1/books/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new ApiError(
      res.status,
      errorData.code ?? "UPDATE_BOOK_FAILED",
      errorData.message ?? "No se pudo actualizar el libro",
    );
  }

  return (await res.json()) as Book;
}

/**
 * `GET /api/v1/books/{id}/notes`
 * Lista las notas de un libro (paginado, orden created_at DESC).
 */
export async function getBookNotes(
  bookId: string,
  page = 1,
  pageSize = 20,
  includeChunks = false,
): Promise<PaginatedNotes> {
  const headers = await authHeaders();
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
    include_chunks: String(includeChunks),
  });
  const res = await fetch(`/api/v1/books/${bookId}/notes?${params}`, {
    headers,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new ApiError(
      res.status,
      errorData.code ?? "GET_NOTES_FAILED",
      errorData.message ?? "No se pudieron obtener las notas",
    );
  }

  return (await res.json()) as PaginatedNotes;
}

/**
 * `POST /api/v1/books/{id}/notes`
 * Crea una nueva nota para un libro.
 */
export async function createNote(
  bookId: string,
  payload: NoteCreateRequest,
): Promise<Note> {
  const headers = await authHeaders();
  const res = await fetch(`/api/v1/books/${bookId}/notes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new ApiError(
      res.status,
      errorData.code ?? "CREATE_NOTE_FAILED",
      errorData.message ?? "No se pudo crear la nota",
    );
  }

  return (await res.json()) as Note;
}

/**
 * `DELETE /api/v1/books/{id}`
 * Borra un libro (y sus notas vía cascada). 204 No Content.
 */
export async function deleteBook(id: string): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(`/api/v1/books/${id}`, {
    method: "DELETE",
    headers,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new ApiError(
      res.status,
      errorData.code ?? "DELETE_BOOK_FAILED",
      errorData.message ?? "No se pudo eliminar el libro",
    );
  }
}

/**
 * `DELETE /api/v1/books/{bookId}/notes/{noteId}`
 * Borra una nota del libro. 204 No Content.
 */
export async function deleteNote(
  bookId: string,
  noteId: string,
): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(`/api/v1/books/${bookId}/notes/${noteId}`, {
    method: "DELETE",
    headers,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new ApiError(
      res.status,
      errorData.code ?? "DELETE_NOTE_FAILED",
      errorData.message ?? "No se pudo eliminar la nota",
    );
  }
}

// ============================================================
// Feature 023: Search Suggestions / Typeahead
// ============================================================

/**
 * `GET /api/v1/books/suggestions?q=&limit=`
 * Sugerencias de búsqueda en vivo (biblioteca + catálogo). Valida la respuesta
 * con Zod y convierte los errores a `ApiError`. Soporta `AbortSignal` para
 * cancelar respuestas obsoletas.
 */
export async function getBookSuggestions(
  query: string,
  limit = 8,
  signal?: AbortSignal,
): Promise<SuggestionsResponse> {
  const headers = await authHeaders();
  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
  });
  const res = await fetch(`/api/v1/books/suggestions?${params.toString()}`, {
    headers,
    signal,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new ApiError(
      res.status,
      errorData.code ?? "SUGGESTIONS_FAILED",
      errorData.message ?? "No se pudieron cargar las sugerencias",
    );
  }

  const parsed = suggestionsResponseSchema.safeParse(await res.json());
  if (!parsed.success) {
    throw new ApiError(
      res.status,
      "INVALID_SUGGESTIONS_RESPONSE",
      "Respuesta de sugerencias inválida",
    );
  }
  return parsed.data;
}
