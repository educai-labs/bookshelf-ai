// Esquemas Zod de preferencias y respuestas (feature 022).
//
// Validación en el cliente ANTES de enviar a la API (convención `tech-stack.md`:
// Zod en frontend, Pydantic en backend). Los rangos/enums deben coincidir con
// `apps/api/app/models/settings.py`.

import { z } from "zod";

// --- Enums (deben coincidir con el backend) --------------------------------

export const themePreferenceSchema = z.enum(["light", "dark", "system"]);
export const languageSchema = z.enum(["es", "en"]);
export const readingFontSchema = z.enum(["system", "serif", "sans"]);
export const chatInitialModeSchema = z.enum(["book", "library"]);

// --- Grupos -----------------------------------------------------------------

export const readerPreferencesSchema = z.object({
  fontSize: z.number().int().min(14).max(22),
  lineWidth: z.number().int().min(480).max(960),
  lineHeight: z.number().min(1.4).max(2.0),
  font: readingFontSchema,
  showBookDetails: z.boolean(),
  confirmDeletions: z.boolean(),
});

export const chatPreferencesSchema = z.object({
  initialMode: chatInitialModeSchema,
  showHistory: z.boolean(),
  clearHistoryOnLogout: z.boolean(),
  respondInInterfaceLanguage: z.boolean(),
  autoRecommendations: z.boolean(),
});

export const notificationPreferencesSchema = z.object({
  errors: z.boolean(),
  vectorizationDone: z.boolean(),
  recommendations: z.boolean(),
  account: z.boolean(),
});

export const privacyPreferencesSchema = z.object({
  useNotesForSearch: z.boolean(),
});

/** Preferencias de cuenta (lo que se envía/recibe del backend). */
export const accountPreferencesSchema = z.object({
  reader: readerPreferencesSchema,
  chat: chatPreferencesSchema,
  notifications: notificationPreferencesSchema,
  privacy: privacyPreferencesSchema,
});

/** Preferencias locales (tema + idioma). */
export const localPreferencesSchema = z.object({
  theme: themePreferenceSchema,
  language: languageSchema,
});

/** Preferencias completas (locales + cuenta). */
export const settingsSchema = accountPreferencesSchema.merge(
  localPreferencesSchema,
);

// --- Respuestas -------------------------------------------------------------

/** Respuesta de `GET /api/v1/settings` (preferencias de cuenta). */
export const accountPreferencesResponseSchema = accountPreferencesSchema;

/** Respuesta de `GET /api/v1/settings/data` (consulta de datos almacenados). */
export const storedDataInfoSchema = z.object({
  books: z.number().int().nonnegative(),
  notes: z.number().int().nonnegative(),
  preferences_updated_at: z.string().nullable(),
  preferences: accountPreferencesSchema,
});

/** Respuesta de `GET /api/v1/settings/export` (libros y notas). */
export const exportDataSchema = z.object({
  exported_at: z.string(),
  books: z.array(z.unknown()),
  notes: z.array(z.unknown()),
});

export type ReaderPreferencesSchema = z.infer<typeof readerPreferencesSchema>;
export type AccountPreferencesSchema = z.infer<typeof accountPreferencesSchema>;
export type LocalPreferencesSchema = z.infer<typeof localPreferencesSchema>;
export type SettingsSchema = z.infer<typeof settingsSchema>;
export type StoredDataInfoSchema = z.infer<typeof storedDataInfoSchema>;
export type ExportDataSchema = z.infer<typeof exportDataSchema>;
