import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsProvider } from "@/contexts/SettingsContext";
import { AppearanceSection } from "./AppearanceSection";
import { ChatSection } from "./ChatSection";
import { ReaderSection } from "./ReaderSection";

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
      fontSize: 16,
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

beforeEach(() => {
  window.localStorage.clear();
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

function renderSection(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <SettingsProvider>{ui}</SettingsProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe("settings (sections)", () => {
  it("cambia el idioma al instante (sin recarga)", async () => {
    const user = userEvent.setup();
    renderSection(<AppearanceSection />);

    // Sección de apariencia con selector de tema e idioma.
    expect(screen.getByText("Apariencia")).toBeInTheDocument();
    const languageSelect = screen.getByRole("combobox", { name: "Idioma" });
    await user.click(languageSelect);
    await user.click(screen.getByRole("option", { name: "Inglés" }));

    // El texto de la propia sección cambia a inglés sin recarga.
    expect(screen.getByText("Appearance")).toBeInTheDocument();
  });

  it("renderiza el selector de tema (light/dark/system)", async () => {
    const user = userEvent.setup();
    renderSection(<AppearanceSection />);

    const themeSelect = screen.getByRole("combobox", { name: "Tema" });
    await user.click(themeSelect);
    expect(screen.getByRole("option", { name: "Claro" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Oscuro" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Sistema" })).toBeInTheDocument();
  });

  it("renderiza los controles del lector con rangos accesibles", () => {
    renderSection(<ReaderSection />);
    const size = screen.getByLabelText(/Tamaño de texto/i);
    expect(size).toHaveAttribute("min", "14");
    expect(size).toHaveAttribute("max", "22");
  });

  it("renderiza las preferencias del chat sin selector de modelo de IA", () => {
    renderSection(<ChatSection />);
    expect(
      screen.getByText(/El modelo de IA no es configurable/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/modelo/i)).not.toBeNull();
  });
});
