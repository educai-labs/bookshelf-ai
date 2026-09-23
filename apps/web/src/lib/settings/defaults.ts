// Defaults y normalización/restauración de preferencias (feature 022).
//
// - `DEFAULT_SETTINGS`: valores por defecto fijados en `plan.md`.
// - `detectBrowserLanguage()`: idioma del navegador con fallback `es`.
// - `normalizeSettings()`: valida y normaliza cualquier objeto (parcial o
//   corrupto) contra los defaults, descartando valores inválidos.
// - `createDefaultSettings()`: restauración completa de defaults.

import type {
  ChatInitialMode,
  ChatPreferences,
  Language,
  NotificationPreferences,
  PrivacyPreferences,
  ReaderPreferences,
  ReadingFont,
  Settings,
  ThemePreference,
} from "@/types/settings";
import { settingsSchema } from "@/lib/validations/settings";

/** Idiomas soportados (spec: solo es/en). */
const SUPPORTED_LANGUAGES: readonly string[] = ["es", "en"];

/** Defaults fijados en `plan.md` §1. */
export const DEFAULT_SETTINGS: Settings = {
  // Locales
  theme: "system",
  language: "es",
  // Lector
  reader: {
    fontSize: 16,
    lineWidth: 720,
    lineHeight: 1.6,
    font: "system",
    showBookDetails: true,
    confirmDeletions: true,
  },
  // Chat
  chat: {
    initialMode: "book",
    showHistory: true,
    clearHistoryOnLogout: true,
    respondInInterfaceLanguage: true,
    autoRecommendations: true,
  },
  // Notificaciones (todas activadas por defecto)
  notifications: {
    errors: true,
    vectorizationDone: true,
    recommendations: true,
    account: true,
  },
  // Privacidad
  privacy: {
    useNotesForSearch: true,
  },
};

/**
 * Detecta el idioma del navegador (`navigator.language`), con fallback a `es`
 * si no es `es` ni `en`. Solo se usa en cliente (SSR-safe).
 */
export function detectBrowserLanguage(): Language {
  if (typeof navigator === "undefined") {
    return "es";
  }
  const raw = (navigator.language ?? "es").toLowerCase();
  const primary = raw.split("-")[0] ?? "";
  return primary === "en" ? "en" : "es";
}

/** Normaliza un número a un rango inclusivo `[min, max]`, con `fallback`. */
function clamp(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeTheme(value: unknown): ThemePreference {
  return value === "light" || value === "dark" || value === "system"
    ? value
    : DEFAULT_SETTINGS.theme;
}

function normalizeLanguage(value: unknown): Language {
  return value === "en" ? "en" : "es";
}

function normalizeFont(value: unknown): ReadingFont {
  return value === "serif" || value === "sans" || value === "system"
    ? value
    : DEFAULT_SETTINGS.reader.font;
}

function normalizeChatMode(value: unknown): ChatInitialMode {
  return value === "book" || value === "library"
    ? value
    : DEFAULT_SETTINGS.chat.initialMode;
}

function normalizeReader(value: unknown): ReaderPreferences {
  const v = (value ?? {}) as Partial<ReaderPreferences>;
  const d = DEFAULT_SETTINGS.reader;
  return {
    fontSize: clamp(v.fontSize, 14, 22, d.fontSize),
    lineWidth: clamp(v.lineWidth, 480, 960, d.lineWidth),
    lineHeight: clamp(v.lineHeight, 1.4, 2.0, d.lineHeight),
    font: normalizeFont(v.font),
    showBookDetails: normalizeBoolean(v.showBookDetails, d.showBookDetails),
    confirmDeletions: normalizeBoolean(v.confirmDeletions, d.confirmDeletions),
  };
}

function normalizeChat(value: unknown): ChatPreferences {
  const v = (value ?? {}) as Partial<ChatPreferences>;
  const d = DEFAULT_SETTINGS.chat;
  return {
    initialMode: normalizeChatMode(v.initialMode),
    showHistory: normalizeBoolean(v.showHistory, d.showHistory),
    clearHistoryOnLogout: normalizeBoolean(
      v.clearHistoryOnLogout,
      d.clearHistoryOnLogout,
    ),
    respondInInterfaceLanguage: normalizeBoolean(
      v.respondInInterfaceLanguage,
      d.respondInInterfaceLanguage,
    ),
    autoRecommendations: normalizeBoolean(
      v.autoRecommendations,
      d.autoRecommendations,
    ),
  };
}

function normalizeNotifications(value: unknown): NotificationPreferences {
  const v = (value ?? {}) as Partial<NotificationPreferences>;
  const d = DEFAULT_SETTINGS.notifications;
  return {
    errors: normalizeBoolean(v.errors, d.errors),
    vectorizationDone: normalizeBoolean(
      v.vectorizationDone,
      d.vectorizationDone,
    ),
    recommendations: normalizeBoolean(v.recommendations, d.recommendations),
    account: normalizeBoolean(v.account, d.account),
  };
}

function normalizePrivacy(value: unknown): PrivacyPreferences {
  const v = (value ?? {}) as Partial<PrivacyPreferences>;
  const d = DEFAULT_SETTINGS.privacy;
  return {
    useNotesForSearch: normalizeBoolean(
      v.useNotesForSearch,
      d.useNotesForSearch,
    ),
  };
}

/**
 * Normaliza un objeto parcial (p. ej. leído de `localStorage`) a un `Settings`
 * completo y válido. Los campos ausentes o inválidos toman el default; nunca
 * se aplican estados parciales inválidos (spec + plan).
 */
export function normalizeSettings(value: unknown): Settings {
  const raw = (value ?? {}) as Partial<Settings>;
  const result: Settings = {
    theme: normalizeTheme(raw.theme),
    language: normalizeLanguage(raw.language),
    reader: normalizeReader(raw.reader),
    chat: normalizeChat(raw.chat),
    notifications: normalizeNotifications(raw.notifications),
    privacy: normalizePrivacy(raw.privacy),
  };
  // Sanity final: la salida debe satisfacer el esquema Zod completo.
  const parsed = settingsSchema.safeParse(result);
  return parsed.success ? parsed.data : createDefaultSettings();
}

/** Devuelve una copia profunda de los defaults (restauración completa). */
export function createDefaultSettings(): Settings {
  return structuredClone(DEFAULT_SETTINGS);
}

/** `true` si el idioma dado está soportado (es/en). */
export function isSupportedLanguage(lang: string): lang is Language {
  return SUPPORTED_LANGUAGES.includes(lang);
}
