import { z } from "zod";

// Esquemas Zod placeholder — se poblarán en las features 012-015
// (auth forms, add book modal, notes, chat).

/** Validación de libros (ISBN, status, rating, fechas) — feature 013/014. */
export const bookSchema = z.object({});

/** Validación de notas (content 1-50000 chars) — feature 015. */
export const noteSchema = z.object({});

/** Validación de chat (message, book_ids, top_k) — feature 017. */
export const chatSchema = z.object({});
