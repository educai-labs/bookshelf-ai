// Esquemas Zod de la respuesta de sugerencias (feature 023).
//
// Validación en el cliente de la forma recibida de
// `GET /api/v1/books/suggestions` (convención `tech-stack.md`: Zod en frontend
// para respuestas API). Los campos deben coincidir con
// `apps/api/app/models/suggestions.py`.

import { z } from "zod";

/** Una sugerencia normalizada (espejo de `BookSuggestion`). */
export const bookSuggestionSchema = z.object({
  source: z.enum(["library", "catalog"]),
  book_id: z.string().uuid().nullable(),
  isbn13: z.string().regex(/^\d{13}$/),
  title: z.string(),
  authors: z.array(z.string()),
  cover_url: z.string().nullable(),
  in_library: z.boolean(),
});

/** Respuesta de `GET /api/v1/books/suggestions`. */
export const suggestionsResponseSchema = z.object({
  query: z.string(),
  limit: z.number().int(),
  items: z.array(bookSuggestionSchema),
});

export type BookSuggestionSchema = z.infer<typeof bookSuggestionSchema>;
export type SuggestionsResponseSchema = z.infer<
  typeof suggestionsResponseSchema
>;
