// Cookie de preferencia de idioma (feature 028).
//
// `localStorage` no existe en el servidor, así que la cookie
// `bookshelf:language` es la fuente SSR de `<html lang>`: el layout raíz la lee
// en el servidor (via `next/headers`) y `SettingsContext` la sincroniza en el
// cliente junto con la actualización inmediata de `document.documentElement.lang`.

import type { Language } from "@/types/settings";

/** Nombre de la cookie de idioma (fuente SSR). */
export const LANGUAGE_COOKIE_NAME = "bookshelf:language";

/** Duración de la cookie (1 año). */
const LANGUAGE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Normaliza un valor cualquiera a un `Language` válido (fallback `es`). */
export function resolveLanguage(value: unknown): Language {
  return value === "en" ? "en" : "es";
}

/** Escribe la cookie de idioma (solo cliente; no lanza). */
export function setLanguageCookie(language: Language): void {
  if (typeof document === "undefined") return;
  try {
    document.cookie = `${LANGUAGE_COOKIE_NAME}=${language}; path=/; max-age=${LANGUAGE_COOKIE_MAX_AGE}; samesite=lax`;
  } catch {
    // No interrumpir la app por un fallo de cookie.
  }
}

/**
 * Parsea una cadena de cookies (`document.cookie` o el header `Cookie`) y
 * devuelve el idioma si la cookie existe y contiene `es`/`en`; `null` si no.
 */
export function readLanguageCookie(cookieHeader: string): Language | null {
  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rest] = part.split("=");
    if (rawName.trim() !== LANGUAGE_COOKIE_NAME) continue;
    let value = rest.join("=").trim();
    try {
      value = decodeURIComponent(value);
    } catch {
      return null;
    }
    return value === "en" || value === "es" ? value : null;
  }
  return null;
}

/** Lee la cookie de idioma desde `document.cookie` (solo cliente). */
export function readClientLanguage(): Language | null {
  if (typeof document === "undefined") return null;
  return readLanguageCookie(document.cookie);
}
