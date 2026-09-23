import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "next-themes";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  SettingsProvider,
  useSettings,
  type ChatHistoryMessage,
} from "./SettingsContext";

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi
        .fn()
        .mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
  },
}));

vi.mock("@/lib/api/settings", () => ({
  getAccountPreferences: vi.fn().mockResolvedValue({
    reader: {
      fontSize: 18,
      lineWidth: 720,
      lineHeight: 1.6,
      font: "system",
      showBookDetails: true,
      confirmDeletions: true,
    },
    chat: {
      initialMode: "book",
      showHistory: true,
      clearHistoryOnLogout: true,
      respondInInterfaceLanguage: true,
      autoRecommendations: true,
    },
    notifications: {
      errors: true,
      vectorizationDone: true,
      recommendations: true,
      account: true,
    },
    privacy: { useNotesForSearch: true },
  }),
  updateAccountPreferences: vi.fn().mockResolvedValue({}),
}));

// jsdom no implementa matchMedia; se stubea para `prefers-reduced-motion`
// (SettingsContext) y para `next-themes` (system theme).
beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  Object.defineProperty(window.navigator, "language", {
    value: "es-ES",
    configurable: true,
  });
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
});

function Consumer() {
  const {
    settings,
    language,
    setLanguage,
    theme,
    setTheme,
    saveChatHistory,
    clearChatHistory,
    restoreDefaults,
  } = useSettings();
  return (
    <div>
      <span data-testid="language">{language}</span>
      <span data-testid="fontSize">{settings.reader.fontSize}</span>
      <span data-testid="theme">{theme}</span>
      <button onClick={() => setLanguage("en")}>set-en</button>
      <button onClick={() => setTheme("dark")}>set-dark</button>
      <button onClick={() => setTheme("light")}>set-light</button>
      <button
        onClick={() =>
          saveChatHistory([
            { role: "user", content: "hola" },
            { role: "assistant", content: "resp" },
          ])
        }
      >
        save-history
      </button>
      <button onClick={() => clearChatHistory()}>clear-history</button>
      <button onClick={() => restoreDefaults()}>restore</button>
    </div>
  );
}

function renderWithProviders() {
  return render(
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <SettingsProvider>
        <Consumer />
      </SettingsProvider>
    </ThemeProvider>,
  );
}

describe("SettingsContext", () => {
  it("persiste el idioma en localStorage al cambiarlo", async () => {
    const user = userEvent.setup();
    renderWithProviders();

    expect(screen.getByTestId("language")).toHaveTextContent("es");
    await user.click(screen.getByText("set-en"));
    expect(screen.getByTestId("language")).toHaveTextContent("en");

    const stored = JSON.parse(
      window.localStorage.getItem("bookshelf:settings") ?? "{}",
    );
    expect(stored.language).toBe("en");
  });

  it("centraliza el historial del chat en sessionStorage", async () => {
    const user = userEvent.setup();
    renderWithProviders();

    await user.click(screen.getByText("save-history"));
    const raw = window.sessionStorage.getItem("chat_history");
    const parsed = JSON.parse(raw ?? "[]") as ChatHistoryMessage[];
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({ role: "user", content: "hola" });

    await user.click(screen.getByText("clear-history"));
    expect(window.sessionStorage.getItem("chat_history")).toBeNull();
  });

  it("restaura los defaults (idioma vuelve a es)", async () => {
    const user = userEvent.setup();
    renderWithProviders();

    await user.click(screen.getByText("set-en"));
    expect(screen.getByTestId("language")).toHaveTextContent("en");

    await user.click(screen.getByText("restore"));
    expect(screen.getByTestId("language")).toHaveTextContent("es");
  });

  it("aplica el tema sin recarga y lo persiste entre montajes", async () => {
    const user = userEvent.setup();
    const { unmount } = renderWithProviders();

    expect(screen.getByTestId("theme")).toHaveTextContent("system");

    await user.click(screen.getByText("set-dark"));

    // Se aplica al <html> (estrategia `class`) sin recargar la página.
    await waitFor(() =>
      expect(document.documentElement.classList.contains("dark")).toBe(true),
    );
    // Se persiste en localStorage (next-themes, clave "theme").
    expect(window.localStorage.getItem("theme")).toBe("dark");

    // Re-apertura (desmontar + volver a montar) → el tema persiste.
    unmount();
    renderWithProviders();
    await waitFor(() =>
      expect(document.documentElement.classList.contains("dark")).toBe(true),
    );
  });
});
