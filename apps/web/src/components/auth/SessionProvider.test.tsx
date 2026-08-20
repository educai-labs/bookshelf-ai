import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SessionProvider, useSessionContext } from "./SessionProvider";

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

function Consumer() {
  const { user, isLoading } = useSessionContext();
  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="user">{user?.email ?? "no-user"}</span>
    </div>
  );
}

describe("SessionProvider", () => {
  it("provides session context to consumers", async () => {
    render(
      <SessionProvider>
        <Consumer />
      </SessionProvider>,
    );

    // Estado inicial: cargando, sin usuario.
    expect(screen.getByTestId("user")).toHaveTextContent("no-user");

    // Tras resolver getSession (null) → deja de cargar, sigue sin usuario.
    expect(await screen.findByTestId("loading")).toHaveTextContent("false");
    expect(screen.getByTestId("user")).toHaveTextContent("no-user");
  });

  it("throws when useSessionContext is used outside a provider", () => {
    function BrokenConsumer() {
      useSessionContext();
      return null;
    }

    expect(() => render(<BrokenConsumer />)).toThrow(
      "useSessionContext must be used within a SessionProvider",
    );
  });
});
