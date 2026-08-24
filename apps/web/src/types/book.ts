// Tipos para el flujo "Añadir libro por ISBN" (feature 014).
// Espejo de los modelos Pydantic del backend: apps/api/app/models/lookup.py, books.py

/** Respuesta de `GET /api/v1/books/lookup?isbn=...` (espejo de `BookLookupResponse`). */
export interface BookLookupResponse {
  cover_url: string | null;
  title: string;
  authors: string[];
  page_count: number | null;
  publisher: string | null;
  published_date: string | null;
  description: string | null;
}

/** Payload para `POST /api/v1/books` (espejo de `BookCreate`). */
export interface BookCreateRequest {
  isbn13: string;
  status: "want_to_read";
}

/** Respuesta de `POST /api/v1/books` (espejo de `BookRead`). */
export interface BookResponse extends BookLookupResponse {
  id: string;
  user_id: string;
  status: "want_to_read" | "reading" | "read";
  rating: number | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// Tipos para Book Detail / Reading Sheet (feature 015)
// Espejo de los modelos Pydantic: apps/api/app/models/books.py, notes.py
// ============================================================

/** Estado de lectura de un libro (enum DB `book_status`). */
export type BookStatus = "want_to_read" | "reading" | "read";

/** Fila de la tabla `books` tal como la devuelve la API (espejo de `BookRead`). */
export interface Book {
  id: string;
  user_id: string;
  isbn13: string;
  title: string;
  authors: string[];
  cover_url: string | null;
  page_count: number | null;
  publisher: string | null;
  published_date: string | null;
  description: string | null;
  status: BookStatus;
  rating: number | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
  /** Nº de notas asociadas (agregado `book_notes(count)`). */
  notes_count: number;
}

/**
 * Filtros de listado. Se serializan a query params de `GET /api/v1/books`:
 * - `status` → param `status` (enum).
 * - `rating_min` → param `rating` (la API filtra por rating exacto 1-5).
 * - `q` → param `q` (búsqueda por título/autor, case-insensitive).
 */
export interface BookFilters {
  status?: BookStatus;
  rating_min?: number; // 1-5
  q?: string;
}

/** Respuesta paginada de `GET /api/v1/books` (espejo de `BookListResponse`). */
export interface PaginatedBooks {
  items: Book[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

/** Payload para `PATCH /api/v1/books/{id}` (espejo de `BookUpdate`). */
export interface BookUpdateRequest {
  status?: BookStatus;
  rating?: number | null; // 1-5, null para borrar
  started_at?: string | null; // ISO date string (yyyy-MM-dd)
  finished_at?: string | null; // ISO date string (yyyy-MM-dd)
}

/** Nota de libro (espejo de `NoteRead`). */
export interface Note {
  id: string;
  book_id: string;
  content: string;
  content_html: string;
  chunk_index: number;
  created_at: string;
}

/** Payload para `POST /api/v1/books/{id}/notes` (espejo de `NoteCreate`). */
export interface NoteCreateRequest {
  content: string;
}

/** Respuesta paginada de notas (espejo de `NoteListResponse`). */
export interface PaginatedNotes {
  items: Note[];
  total: number;
  page: number;
  page_size: number;
}
