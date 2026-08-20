import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RegisterForm } from "./RegisterForm";

const mocks = vi.hoisted(() => ({
  signUp: vi.fn(),
  signInWithOAuth: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: {
      signUp: mocks.signUp,
      signInWithOAuth: mocks.signInWithOAuth,
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

describe("RegisterForm", () => {
  beforeEach(() => {
    mocks.signUp.mockReset();
    mocks.signInWithOAuth.mockReset();
    vi.clearAllMocks();
  });

  function fillAndSubmit() {
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "ana@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/contraseña/i), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /crear cuenta/i }));
  }

  it("registers with email/password and shows confirmation + link to login", async () => {
    mocks.signUp.mockResolvedValue({ error: null });

    render(<RegisterForm />);
    fillAndSubmit();

    await waitFor(() =>
      expect(mocks.signUp).toHaveBeenCalledWith({
        email: "ana@example.com",
        password: "password123",
      }),
    );
    expect(toast.success).toHaveBeenCalledWith(
      "Revisa tu email para confirmar la cuenta",
    );

    const loginLink = await screen.findByRole("link", {
      name: /ir a iniciar sesión/i,
    });
    expect(loginLink).toHaveAttribute("href", "/login");
  });

  it("shows an error toast when signUp fails", async () => {
    mocks.signUp.mockResolvedValue({
      error: { message: "User already registered" },
    });

    render(<RegisterForm />);
    fillAndSubmit();

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("User already registered"),
    );
  });

  it("shows an error toast when signUp throws", async () => {
    mocks.signUp.mockRejectedValue(new Error("network down"));

    render(<RegisterForm />);
    fillAndSubmit();

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Error inesperado al crear la cuenta",
      ),
    );
  });

  it("validates the form and does not submit when invalid", async () => {
    render(<RegisterForm />);
    fireEvent.click(screen.getByRole("button", { name: /crear cuenta/i }));

    expect(await screen.findByText("Email inválido")).toBeInTheDocument();
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it("continues with Google OAuth redirecting to /auth/callback", async () => {
    mocks.signInWithOAuth.mockResolvedValue({ error: null });

    render(<RegisterForm />);
    fireEvent.click(
      screen.getByRole("button", { name: /continuar con google/i }),
    );

    await waitFor(() =>
      expect(mocks.signInWithOAuth).toHaveBeenCalledWith({
        provider: "google",
        options: { redirectTo: "/auth/callback" },
      }),
    );
  });

  it("shows an error toast when Google OAuth throws", async () => {
    mocks.signInWithOAuth.mockRejectedValue(new Error("network down"));

    render(<RegisterForm />);
    fireEvent.click(
      screen.getByRole("button", { name: /continuar con google/i }),
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Error al conectar con Google"),
    );
  });

  it("links to /login for existing accounts", () => {
    render(<RegisterForm />);
    expect(
      screen.getByRole("link", { name: /inicia sesión/i }),
    ).toHaveAttribute("href", "/login");
  });
});
