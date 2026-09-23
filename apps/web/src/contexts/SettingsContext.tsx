"use client";

// Contexto único de preferencias del cliente (feature 022).
//
// `SettingsProvider` centraliza TODO el estado de preferencias (secciones
// 3.1–3.7) y expone una fachada `useSettings`. Ningún componente debe leer o
// escribir `localStorage`/`sessionStorage` ni llamar a la API de settings
// directamente (criterio de aceptación de contexto único).

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTheme } from "next-themes";

import {
  getAccountPreferences,
  updateAccountPreferences,
} from "@/lib/api/settings";
import {
  createDefaultSettings,
  detectBrowserLanguage,
  normalizeSettings,
} from "@/lib/settings/defaults";
import {
  CHAT_HISTORY_STORAGE_KEY,
  readJson,
  removeKey,
  writeJson,
} from "@/lib/settings/storage";
import { supabase } from "@/lib/supabase/client";
import type {
  ChatPreferences,
  Language,
  NotificationPreferences,
  PrivacyPreferences,
  ReaderPreferences,
  Settings,
  ThemePreference,
} from "@/types/settings";

/** Mensaje del historial temporal del chat (contrato `{ role, content }`). */
export interface ChatHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

interface SettingsContextValue {
  /** Preferencias completas (locales + cuenta) normalizadas. */
  settings: Settings;

  // Tema (delegado a next-themes; `class` strategy).
  theme: ThemePreference;
  resolvedTheme: "light" | "dark" | "system";
  setTheme: (theme: ThemePreference) => void;

  // Idioma.
  language: Language;
  setLanguage: (language: Language) => void;

  // Preferencias de cuenta (reader/chat/notifications/privacy).
  updateReader: (patch: Partial<ReaderPreferences>) => void;
  updateChat: (patch: Partial<ChatPreferences>) => void;
  updateNotifications: (patch: Partial<NotificationPreferences>) => void;
  updatePrivacy: (patch: Partial<PrivacyPreferences>) => void;

  /** true si las preferencias de cuenta ya se cargaron/descargaron. */
  isAccountLoaded: boolean;
  accountError: string | null;

  // Accesibilidad.
  reducedMotion: boolean;

  // Historial temporal del chat (sessionStorage, centralizado aquí).
  loadChatHistory: () => ChatHistoryMessage[];
  saveChatHistory: (messages: ChatHistoryMessage[]) => void;
  clearChatHistory: () => void;

  // Acciones.
  restoreDefaults: () => void;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(
  undefined,
);

const ACCOUNT_SYNC_DEBOUNCE_MS = 600;

function readStoredLanguage(): Language | null {
  const raw = readJson<{ language?: unknown }>("bookshelf:settings", "local");
  return raw?.language === "en" || raw?.language === "es" ? raw.language : null;
}

function isStoredMessage(value: unknown): value is ChatHistoryMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    ((value as ChatHistoryMessage).role === "user" ||
      (value as ChatHistoryMessage).role === "assistant") &&
    typeof (value as ChatHistoryMessage).content === "string"
  );
}

function loadHistory(): ChatHistoryMessage[] {
  const raw = readJson<unknown>(CHAT_HISTORY_STORAGE_KEY, "session");
  if (!Array.isArray(raw)) return [];
  return raw.filter(isStoredMessage);
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const {
    theme: nextTheme,
    setTheme: setNextTheme,
    resolvedTheme,
  } = useTheme();

  // --- Estado local (idioma) + cuenta --------------------------------------
  const [settings, setSettings] = useState<Settings>(() =>
    normalizeSettings({
      language: readStoredLanguage() ?? detectBrowserLanguage(),
    }),
  );
  const [isAccountLoaded, setIsAccountLoaded] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  const userIdRef = useRef<string | null>(null);
  const accountSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accountRef = useRef(settings);
  accountRef.current = settings;

  const theme: ThemePreference =
    nextTheme === "light" || nextTheme === "dark" ? nextTheme : "system";

  // --- Suscripción a prefers-reduced-motion (sección 3.7) ------------------
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  // --- Sincroniza el idioma con `document.documentElement.lang` -------------
  useEffect(() => {
    document.documentElement.lang = settings.language;
  }, [settings.language]);

  // --- Persiste el idioma (local) ------------------------------------------
  useEffect(() => {
    writeJson("bookshelf:settings", { language: settings.language }, "local");
  }, [settings.language]);

  // --- Carga/descarga de preferencias de cuenta al cambiar de sesión -------
  useEffect(() => {
    let mounted = true;

    function applyAccount(prefs: Settings | null) {
      setSettings((prev) =>
        normalizeSettings({
          language: prev.language,
          reader: prefs?.reader,
          chat: prefs?.chat,
          notifications: prefs?.notifications,
          privacy: prefs?.privacy,
        }),
      );
      setIsAccountLoaded(true);
    }

    async function loadAccount(userId: string) {
      try {
        const prefs = await getAccountPreferences();
        if (mounted && userIdRef.current === userId) {
          setAccountError(null);
          setSettings((prev) =>
            normalizeSettings({
              language: prev.language,
              reader: prefs.reader,
              chat: prefs.chat,
              notifications: prefs.notifications,
              privacy: prefs.privacy,
            }),
          );
          setIsAccountLoaded(true);
        }
      } catch (err) {
        if (mounted && userIdRef.current === userId) {
          setAccountError(
            err instanceof Error ? err.message : "Error cargando preferencias",
          );
          setIsAccountLoaded(true);
        }
      }
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      const userId = session?.user?.id ?? null;
      userIdRef.current = userId;
      if (userId) {
        void loadAccount(userId);
      } else if (mounted) {
        applyAccount(null);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const userId = session?.user?.id ?? null;
      const previous = userIdRef.current;
      userIdRef.current = userId;

      if (userId) {
        // Al iniciar sesión (SIGNED_IN / TOKEN_REFRESHED con nuevo usuario).
        if (previous !== userId) {
          void loadAccount(userId);
        }
      } else {
        // Al cerrar sesión: limpia historial si la preferencia lo indica y
        // resetea las preferencias de cuenta a defaults.
        setSettings((prev) => {
          if (prev.chat.clearHistoryOnLogout) {
            removeKey(CHAT_HISTORY_STORAGE_KEY, "session");
          }
          return normalizeSettings({ language: prev.language });
        });
        setIsAccountLoaded(true);
        setAccountError(null);
      }
      if (event === "SIGNED_OUT") {
        void applyAccount(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
      if (accountSyncTimer.current) {
        clearTimeout(accountSyncTimer.current);
      }
    };
  }, []);

  // --- Sincronización (debounce) de cambios de cuenta hacia la API ---------
  const scheduleAccountSync = useCallback(() => {
    if (accountSyncTimer.current) {
      clearTimeout(accountSyncTimer.current);
    }
    accountSyncTimer.current = setTimeout(() => {
      const userId = userIdRef.current;
      if (!userId) return;
      const current = accountRef.current;
      void updateAccountPreferences({
        reader: current.reader,
        chat: current.chat,
        notifications: current.notifications,
        privacy: current.privacy,
      }).catch(() => {
        // El error se refleja vía toasts en la UI de settings; aquí no se
        // revierte para no perder el input del usuario.
      });
    }, ACCOUNT_SYNC_DEBOUNCE_MS);
  }, []);

  const patchAccount = useCallback(
    (patch: Partial<Settings>) => {
      setSettings((prev) => normalizeSettings({ ...prev, ...patch }));
      scheduleAccountSync();
    },
    [scheduleAccountSync],
  );

  const updateReader = useCallback(
    (patch: Partial<ReaderPreferences>) =>
      patchAccount({ reader: { ...accountRef.current.reader, ...patch } }),
    [patchAccount],
  );
  const updateChat = useCallback(
    (patch: Partial<ChatPreferences>) =>
      patchAccount({ chat: { ...accountRef.current.chat, ...patch } }),
    [patchAccount],
  );
  const updateNotifications = useCallback(
    (patch: Partial<NotificationPreferences>) =>
      patchAccount({
        notifications: { ...accountRef.current.notifications, ...patch },
      }),
    [patchAccount],
  );
  const updatePrivacy = useCallback(
    (patch: Partial<PrivacyPreferences>) =>
      patchAccount({ privacy: { ...accountRef.current.privacy, ...patch } }),
    [patchAccount],
  );

  const setTheme = useCallback(
    (next: ThemePreference) => {
      setNextTheme(next);
    },
    [setNextTheme],
  );

  const setLanguage = useCallback((language: Language) => {
    setSettings((prev) => normalizeSettings({ ...prev, language }));
  }, []);

  const clearChatHistory = useCallback(() => {
    removeKey(CHAT_HISTORY_STORAGE_KEY, "session");
  }, []);

  const saveChatHistory = useCallback((messages: ChatHistoryMessage[]) => {
    writeJson(CHAT_HISTORY_STORAGE_KEY, messages, "session");
  }, []);

  const loadChatHistory = useCallback(() => loadHistory(), []);

  const restoreDefaults = useCallback(() => {
    const defaults = createDefaultSettings();
    setTheme("system");
    setSettings(() =>
      normalizeSettings({
        ...defaults,
        language: detectBrowserLanguage(),
      }),
    );
    scheduleAccountSync();
  }, [setTheme, scheduleAccountSync]);

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      theme,
      resolvedTheme:
        resolvedTheme === "dark"
          ? "dark"
          : resolvedTheme === "light"
            ? "light"
            : "system",
      setTheme,
      language: settings.language,
      setLanguage,
      updateReader,
      updateChat,
      updateNotifications,
      updatePrivacy,
      isAccountLoaded,
      accountError,
      reducedMotion,
      loadChatHistory,
      saveChatHistory,
      clearChatHistory,
      restoreDefaults,
    }),
    [
      settings,
      theme,
      resolvedTheme,
      setTheme,
      setLanguage,
      updateReader,
      updateChat,
      updateNotifications,
      updatePrivacy,
      isAccountLoaded,
      accountError,
      reducedMotion,
      loadChatHistory,
      saveChatHistory,
      clearChatHistory,
      restoreDefaults,
    ],
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (ctx === undefined) {
    // Fuera de `SettingsProvider` (p. ej. tests aislados): devuelve un valor
    // por defecto con setters no-op para que los componentes sean renderizables
    // en aislamiento. En la app real el proveedor siempre envuelve el árbol.
    return FALLBACK_CONTEXT;
  }
  return ctx;
}

/** Contexto por defecto (fuera del proveedor): defaults + setters no-op. */
const FALLBACK_CONTEXT: SettingsContextValue = {
  settings: createDefaultSettings(),
  theme: "system",
  resolvedTheme: "system",
  setTheme: () => undefined,
  language: "es",
  setLanguage: () => undefined,
  updateReader: () => undefined,
  updateChat: () => undefined,
  updateNotifications: () => undefined,
  updatePrivacy: () => undefined,
  isAccountLoaded: true,
  accountError: null,
  reducedMotion: false,
  loadChatHistory: () => loadHistory(),
  saveChatHistory: (messages) =>
    writeJson(CHAT_HISTORY_STORAGE_KEY, messages, "session"),
  clearChatHistory: () => removeKey(CHAT_HISTORY_STORAGE_KEY, "session"),
  restoreDefaults: () => undefined,
};
