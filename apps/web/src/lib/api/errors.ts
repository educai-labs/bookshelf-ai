// Mapeo compartido de errores HTTP del flujo de alta (features 014 + 023).
//
// Única fuente de verdad para convertir los estados 400/404/409/500 del alta a
// sus claves i18n. Lo consumen tanto el lookup (AddBookModal) como la mutación
// de creación (useAddBook), de modo que los mensajes no puedan volver a
// divergir entre ambos caminos.

import type { TranslationKey } from "@/lib/i18n";

/** Clave i18n por estado HTTP conocido del alta (lookup + create). */
const ADD_BOOK_ERROR_KEYS: Record<number, TranslationKey> = {
  400: "addBook.errorInvalid",
  404: "addBook.errorNotFound",
  409: "addBook.errorDuplicate",
  500: "addBook.errorServer",
};

/** Fallback genérico cuando el estado no está mapeado (o no hay estado). */
const ADD_BOOK_ERROR_GENERIC: TranslationKey = "addBook.errorGeneric";

/**
 * Devuelve la clave i18n del mensaje de error para un estado HTTP del alta.
 * 400/404/409/500 → clave específica; cualquier otro estado (o `undefined`)
 * → fallback genérico `addBook.errorGeneric`.
 */
export function addBookErrorKey(status?: number): TranslationKey {
  if (status !== undefined && status in ADD_BOOK_ERROR_KEYS) {
    return ADD_BOOK_ERROR_KEYS[status];
  }
  return ADD_BOOK_ERROR_GENERIC;
}
