import { z } from "zod";

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
