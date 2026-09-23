// Tipos de preferencias del cliente (feature 022 · Client Settings).
//
// Estructura en dos grupos de persistencia (spec §Persistencia):
// - Locales (`localStorage`): tema e idioma — responden inmediatamente y se
//   guardan por dispositivo.
// - De cuenta (PostgreSQL/Supabase, sincronizadas entre dispositivos): lector,
//   chat, notificaciones y privacidad.
//
// Espejo de los modelos Pydantic del backend:
// `apps/api/app/models/settings.py`.

/** Tema visual: claro, oscuro o seguir el sistema operativo. */
export type ThemePreference = "light" | "dark" | "system";

/** Idiomas soportados (español / inglés). */
export type Language = "es" | "en";

/** Fuente del área de lectura. */
export type ReadingFont = "system" | "serif" | "sans";

/** Modo inicial del chat: contexto del libro o biblioteca completa (RAG). */
export type ChatInitialMode = "book" | "library";

/** Preferencias del lector (sección 3.3). */
export interface ReaderPreferences {
  /** Tamaño de texto de lectura en px (14–22). */
  fontSize: number;
  /** Ancho del área de lectura en px (480–960). */
  lineWidth: number;
  /** Interlineado (1.4–2.0). */
  lineHeight: number;
  /** Fuente de lectura. */
  font: ReadingFont;
  /** Mostrar/ocultar información adicional del libro. */
  showBookDetails: boolean;
  /** Confirmar antes de eliminar libros/notas. */
  confirmDeletions: boolean;
}

/** Preferencias del chat (sección 3.4). El modelo de IA no es configurable. */
export interface ChatPreferences {
  /** Modo inicial (libro / biblioteca completa). */
  initialMode: ChatInitialMode;
  /** Mostrar/ocultar historial. */
  showHistory: boolean;
  /** Limpiar historial al cerrar sesión. */
  clearHistoryOnLogout: boolean;
  /** Respuestas en el idioma de la interfaz. */
  respondInInterfaceLanguage: boolean;
  /** Activar/desactivar generación automática de recomendaciones. */
  autoRecommendations: boolean;
}

/** Preferencias de notificaciones (sección 3.5). */
export interface NotificationPreferences {
  /** Notificar errores. */
  errors: boolean;
  /** Notificar fin de vectorización de nota. */
  vectorizationDone: boolean;
  /** Notificar recomendaciones. */
  recommendations: boolean;
  /** Notificar eventos de cuenta. */
  account: boolean;
}

/** Preferencias de privacidad y datos (sección 3.6). */
export interface PrivacyPreferences {
  /** Usar las notas para búsqueda semántica y chat. */
  useNotesForSearch: boolean;
}

/** Preferencias locales (persistidas en `localStorage`). */
export interface LocalPreferences {
  theme: ThemePreference;
  language: Language;
}

/** Preferencias de cuenta (persistidas en DB). */
export interface AccountPreferences {
  reader: ReaderPreferences;
  chat: ChatPreferences;
  notifications: NotificationPreferences;
  privacy: PrivacyPreferences;
}

/** Preferencias completas del cliente. */
export interface Settings extends LocalPreferences, AccountPreferences {}

/** Datos que la API expone al consultar "qué datos se almacenan". */
export interface StoredDataInfo {
  books: number;
  notes: number;
  /** Fecha de última modificación de las preferencias (ISO) o null. */
  preferences_updated_at: string | null;
  /** Grupos de preferencias guardados en la cuenta. */
  preferences: AccountPreferences;
}

/** Payload de exportación de libros y notas (sección 3.6). */
export interface ExportData {
  /** ISO timestamp del momento de exportación. */
  exported_at: string;
  /** Libros del usuario. */
  books: unknown[];
  /** Notas del usuario (sin embeddings). */
  notes: unknown[];
}

/** Errores estructurados de la API (`{ code, message, field? }`). */
export interface SettingsApiError {
  code: string;
  message: string;
  field?: string;
}
