// Validación de destinos post-login (feature 028).
//
// El middleware guarda `?redirectTo=<ruta>` al expulsar a login; antes de
// navegar, ese valor se valida como ruta interna relativa para impedir open
// redirects. Cualquier valor externo, vacío o malformado cae a `/dashboard`.

import { DEFAULT_REDIRECT } from "@/lib/navigation/routes";

/**
 * Valida `redirectTo` como ruta interna relativa segura:
 * - Debe empezar por `/`.
 * - No puede empezar por `//` (protocol-relative).
 * - No puede contener `\` (browsers la normalizan a `/`).
 * - No puede contener caracteres de control.
 * - No admite esquemas (`https:`, `javascript:`, `data:`) ni hostnames.
 *
 * Devuelve la ruta validada o `DEFAULT_REDIRECT` como fallback.
 */
export function safeRedirectTo(value: string | null | undefined): string {
  if (typeof value !== "string") {
    return DEFAULT_REDIRECT;
  }
  const candidate = value.trim();
  if (!candidate) {
    return DEFAULT_REDIRECT;
  }
  if (!candidate.startsWith("/")) {
    return DEFAULT_REDIRECT;
  }
  if (candidate.startsWith("//")) {
    return DEFAULT_REDIRECT;
  }
  if (/[\\\u0000-\u001f\u007f]/.test(candidate)) {
    return DEFAULT_REDIRECT;
  }
  return candidate;
}

/**
 * Añade `?redirectTo=<valor>` (codificado) a una ruta, solo si hay valor.
 * Se usa para preservar el destino original en enlaces login↔register.
 */
export function withRedirectTo(
  path: string,
  redirectTo: string | null | undefined,
): string {
  if (redirectTo) {
    return `${path}?redirectTo=${encodeURIComponent(redirectTo)}`;
  }
  return path;
}
