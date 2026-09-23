// Utilidades de fechas y números basadas en `Intl` (feature 022).
//
// A diferencia de `date-fns` (locale fijo), estas utilidades respetan el idioma
// activo de settings (es/en) usando `Intl.DateTimeFormat` e `Intl.NumberFormat`
// (criterio de aceptación: fechas, números y etiquetas adaptados al idioma).

import type { Language } from "@/types/settings";

/** Mapa de idioma → locale BCP-47 para `Intl`. */
const LOCALES: Record<Language, string> = {
  es: "es-ES",
  en: "en-US",
};

function localeFor(lang: Language): string {
  return LOCALES[lang] ?? "es-ES";
}

/** Formatea una fecha ISO/Date a `dd/MM/yyyy` (es) o `MM/dd/yyyy` (en). */
export function formatDate(
  lang: Language,
  value: string | Date,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat(localeFor(lang), options).format(date);
}

/** Formatea una fecha como texto corto (`14 mar 2026`). */
export function formatDateShort(lang: Language, value: string | Date): string {
  return formatDate(lang, value, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Formatea un número con separadores del idioma activo. */
export function formatNumber(
  lang: Language,
  value: number,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(localeFor(lang), options).format(value);
}

/** Pluraliza una etiqueta según la cantidad (es/en). */
export function pluralize(
  lang: Language,
  count: number,
  one: string,
  many: string,
): string {
  return count === 1 ? one : many;
}

/** Unidades y su duración en milisegundos, de mayor a menor. */
const UNITS: Array<{ unit: Intl.RelativeTimeFormatUnit; ms: number }> = [
  { unit: "year", ms: 1000 * 60 * 60 * 24 * 365 },
  { unit: "month", ms: 1000 * 60 * 60 * 24 * 30 },
  { unit: "day", ms: 1000 * 60 * 60 * 24 },
  { unit: "hour", ms: 1000 * 60 * 60 },
  { unit: "minute", ms: 1000 * 60 },
  { unit: "second", ms: 1000 },
];

/**
 * Formatea una fecha como tiempo relativo ("hace 5 minutos" / "5 minutes ago")
 * usando `Intl.RelativeTimeFormat` con el idioma activo.
 */
export function formatRelativeTime(
  lang: Language,
  value: string | Date,
): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const diffMs = date.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat(localeFor(lang), { numeric: "auto" });
  for (const { unit, ms } of UNITS) {
    if (abs >= ms || unit === "second") {
      return rtf.format(Math.round(diffMs / ms), unit);
    }
  }
  return rtf.format(0, "second");
}
