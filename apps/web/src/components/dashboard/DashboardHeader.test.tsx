import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { SessionProvider } from "@/components/auth/SessionProvider";
import { AddBookModalProvider } from "@/components/books/AddBookModalProvider";
import { DashboardHeader } from "./DashboardHeader";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
      onAuthStateChange: mocks.onAuthStateChange,
      signOut: mocks.signOut,
    },
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
    promise: vi.fn(),
  },
}));

// Preferencias controlables por test (feature 022).
const notifState = vi.hoisted(() => ({ account: true, errors: true }));

vi.mock("@/contexts/SettingsContext", () => ({
  useSettings: () => ({
    settings: {
      notifications: {
        account: notifState.account,
        errors: notifState.errors,
        vectorizationDone: true,
        recommendations: true,
      },
      reader: { confirmDeletions: true },
      chat: { respondInInterfaceLanguage: true },
      privacy: { useNotesForSearch: true },
      language: "es",
      theme: "system",
    },
    language: "es",
    theme: "system",
    resolvedTheme: "system",
    setTheme: vi.fn(),
    setLanguage: vi.fn(),
    updateReader: vi.fn(),
    updateChat: vi.fn(),
    updateNotifications: vi.fn(),
    updatePrivacy: vi.fn(),
    isAccountLoaded: true,
    accountError: null,
    reducedMotion: false,
    loadChatHistory: vi.fn(),
    saveChatHistory: vi.fn(),
    clearChatHistory: vi.fn(),
    restoreDefaults: vi.fn(),
  }),
}));

import { toast } from "sonner";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <SessionProvider>{children}</SessionProvider>
      </QueryClientProvider>
    );
  };
}

function renderWithSession() {
  const Wrapper = createWrapper();
  return render(
    <AddBookModalProvider>
      <DashboardHeader />
    </AddBookModalProvider>,
    { wrapper: Wrapper },
  );
}

describe("DashboardHeader", () => {
  beforeEach(() => {
    mocks.push.mockReset();
    mocks.signOut.mockReset();
    mocks.getSession.mockReset();
    mocks.onAuthStateChange.mockReset();
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
    notifState.account = true;
    notifState.errors = true;
    mocks.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    mocks.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
  });

  it("shows a fallback label when there is no session", async () => {
    renderWithSession();
    expect(await screen.findByText("Mi cuenta")).toBeInTheDocument();
  });

  it("shows the user email and avatar initials", async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { email: "ana.moreno@example.com" } } },
      error: null,
    });

    renderWithSession();

    expect(
      await screen.findByText("ana.moreno@example.com"),
    ).toBeInTheDocument();
    expect(screen.getByText("AM")).toBeInTheDocument();
  });

  it("logs out, shows a success toast and redirects to /login", async () => {
    const user = userEvent.setup();
    mocks.signOut.mockResolvedValue({ error: null });
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { email: "ana@example.com" } } },
      error: null,
    });

    renderWithSession();

    // Abre el dropdown con userEvent (secuencia completa pointer/mouse).
    await user.click(
      await screen.findByRole("button", { name: /ana@example.com/i }),
    );
    await user.click(await screen.findByText("Cerrar sesión"));

    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledTimes(1));
    expect(toast.success).toHaveBeenCalledWith("Sesión cerrada");
    expect(mocks.push).toHaveBeenCalledWith("/login");
  });

  it("shows an error toast when signOut throws", async () => {
    const user = userEvent.setup();
    mocks.signOut.mockRejectedValue(new Error("network down"));
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { email: "ana@example.com" } } },
      error: null,
    });

    renderWithSession();

    await user.click(
      await screen.findByRole("button", { name: /ana@example.com/i }),
    );
    await user.click(await screen.findByText("Cerrar sesión"));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Error al cerrar sesión"),
    );
  });

  it("no muestra toast de éxito al cerrar sesión si notifications.account está desactivada", async () => {
    notifState.account = false;
    const user = userEvent.setup();
    mocks.signOut.mockResolvedValue({ error: null });
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { email: "ana@example.com" } } },
      error: null,
    });

    renderWithSession();

    await user.click(
      await screen.findByRole("button", { name: /ana@example.com/i }),
    );
    await user.click(await screen.findByText("Cerrar sesión"));

    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledTimes(1));
    expect(toast.success).not.toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledWith("/login");
  });

  it("no muestra toast de error si notifications.errors está desactivada", async () => {
    notifState.errors = false;
    const user = userEvent.setup();
    mocks.signOut.mockRejectedValue(new Error("network down"));
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { email: "ana@example.com" } } },
      error: null,
    });

    renderWithSession();

    await user.click(
      await screen.findByRole("button", { name: /ana@example.com/i }),
    );
    await user.click(await screen.findByText("Cerrar sesión"));

    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledTimes(1));
    expect(toast.error).not.toHaveBeenCalled();
  });
});
