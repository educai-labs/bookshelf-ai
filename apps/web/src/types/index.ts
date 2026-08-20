// Tipos compartidos del frontend.
// Sync con los modelos Pydantic del backend: apps/api/app/models/*.py
// (features 007, 009, 010).

/** Estado de lectura de un libro (enum DB `book_status`). */
export type BookStatus = "want_to_read" | "reading" | "read";

/** Fila de la tabla `books` (espejo de `BookRead`). */
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
}

/** Fila de la tabla `book_notes` (espejo de `NoteRead`). */
export interface Note {
  id: string;
  user_id: string;
  book_id: string;
  content: string;
  content_html: string;
  chunk_index: number;
  /** Vector de embedding (768 dims). `null` si no se expone. */
  embedding: number[] | null;
  created_at: string;
}

/** Metadatos normalizados de un libro (espejo de `BookMetadata`). */
export interface BookMetadata {
  title: string;
  authors: string[];
  cover_url: string | null;
  page_count: number | null;
  publisher: string | null;
  published_date: string | null;
  description: string | null;
}

/** Payload de chat con la biblioteca (espejo de `ChatRequest`). */
export interface ChatRequest {
  message: string;
  book_ids?: string[];
  top_k?: number;
}

/** Chunk de la respuesta SSE del chat. */
export interface ChatResponseChunk {
  chunk: string;
  done: boolean;
  book_references?: Array<{
    book_id: string;
    title: string;
  }>;
}
