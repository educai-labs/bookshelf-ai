// Utilidades de normalización de ISBN (feature 023).
//
// El modal "Añadir libro" acepta texto libre (título/autor/ISBN) y detecta un
// ISBN-13 completo escrito a mano. La normalización elimina guiones y espacios
// y valida 13 dígitos (misma regla que `books.isbn13` en el backend).

/** ISBN-13: 13 dígitos exactos. */
const ISBN13_RE = /^\d{13}$/;

/**
 * Normaliza un texto a ISBN-13 (quita guiones/espacios y valida 13 dígitos).
 * Devuelve los 13 dígitos o `null` si el texto no es un ISBN-13 completo.
 */
export function normalizeIsbn13(text: string): string | null {
  const digits = text.replace(/[\s-]/g, "");
  return ISBN13_RE.test(digits) ? digits : null;
}
