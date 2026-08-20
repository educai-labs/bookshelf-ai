import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combina clases condicionales y resuelve conflictos de utilidades Tailwind
 * (convención shadcn/ui).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Formatea una fecha (string ISO o Date) a locale por defecto con opciones
 * personalizables. Usado en UI (listas de libros, notas, etc.).
 */
export function formatDate(
  date: string | Date,
  options?: Intl.DateTimeFormatOptions,
): string {
  const value = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("es-ES", options).format(value);
}
