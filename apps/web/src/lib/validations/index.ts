import { z } from "zod";

// Esquemas Zod placeholder — se poblarán en las features 012-015
// (auth forms, add book modal, notes, chat).

/** Validación de libros (ISBN, status, rating, fechas) — feature 013/014. */
export const bookSchema = z.object({});

/** Validación de notas (content 1-50000 chars) — feature 015. */
export const noteSchema = z.object({});

/** Validación de chat (message, book_ids, top_k) — feature 017. */
export const chatSchema = z.object({});

// --- Auth (feature 012) ---

/** Validación del formulario de login (email + password). */
export const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
});
export type LoginValues = z.infer<typeof loginSchema>;

/** Validación del formulario de registro (email + password). */
export const registerSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
});
export type RegisterValues = z.infer<typeof registerSchema>;
