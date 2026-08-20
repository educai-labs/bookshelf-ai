import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SessionProvider } from "@/components/auth/SessionProvider";
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

import { toast } from "sonner";

function renderWithSession() {
  return render(
    <SessionProvider>
      <DashboardHeader />
    </SessionProvider>,
  );
}

describe("DashboardHeader", () => {
  beforeEach(() => {
    mocks.push.mockReset();
    mocks.signOut.mockReset();
    mocks.getSession.mockReset();
    mocks.onAuthStateChange.mockReset();
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
});
