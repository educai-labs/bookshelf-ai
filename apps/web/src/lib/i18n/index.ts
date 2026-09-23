// Utilidades de traducción y formateo (feature 022).
//
// `translate(lang, key, params)` es una función pura (testeable) que resuelve
// una clave anidada (`"auth.login.title"`) en el diccionario del idioma dado.
// `useTranslation()` es el hook de React que lee el idioma activo desde
// `SettingsContext`. Ambos usan los diccionarios tipados de `dictionaries.ts`.

import { useSettings } from "@/contexts/SettingsContext";
import { en, es, type Dictionary, type TranslationKey } from "./dictionaries";

const DICTIONARIES: Record<string, Dictionary> = { es, en };

/** Obtiene el valor de una clave anidada (`"a.b.c"`) de un objeto. */
function getByPath(dict: Dictionary, key: string): unknown {
  const parts = key.split(".");
  let current: unknown = dict;
  for (const part of parts) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Traduce una clave (con parámetros opcionales `{name}`). Si falta la clave o
 * el idioma, devuelve la propia clave (fallback seguro, nunca rompe la UI).
 */
export function translate(
  lang: string,
  key: TranslationKey,
  params?: Record<string, string | number>,
): string {
  const dict = DICTIONARIES[lang] ?? es;
  const value = getByPath(dict, key as string);
  if (typeof value !== "string") {
    return key as string;
  }
  if (!params) {
    return value;
  }
  return value.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/** Hook de traducción ligado al idioma activo del contexto de settings. */
export function useTranslation() {
  const { language } = useSettings();
  return {
    language,
    t: (key: TranslationKey, params?: Record<string, string | number>) =>
      translate(language, key, params),
  };
}

export type { Dictionary, TranslationKey } from "./dictionaries";
