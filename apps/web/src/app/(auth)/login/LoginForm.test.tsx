import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LoginForm } from "./LoginForm";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  signInWithPassword: vi.fn(),
  signInWithOAuth: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: {
      signInWithPassword: mocks.signInWithPassword,
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

describe("LoginForm", () => {
  beforeEach(() => {
    mocks.push.mockReset();
    mocks.signInWithPassword.mockReset();
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
    fireEvent.click(screen.getByRole("button", { name: /iniciar sesión/i }));
  }

  it("signs in with email/password, shows toast and redirects to /dashboard", async () => {
    mocks.signInWithPassword.mockResolvedValue({ error: null });

    render(<LoginForm />);
    fillAndSubmit();

    await waitFor(() =>
      expect(mocks.signInWithPassword).toHaveBeenCalledWith({
        email: "ana@example.com",
        password: "password123",
      }),
    );
    expect(toast.success).toHaveBeenCalledWith("Sesión iniciada correctamente");
    expect(mocks.push).toHaveBeenCalledWith("/dashboard");
  });

  it("shows an error toast when credentials are invalid", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      error: { message: "Invalid login credentials" },
    });

    render(<LoginForm />);
    fillAndSubmit();

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Invalid login credentials"),
    );
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("shows an error toast when signInWithPassword throws", async () => {
    mocks.signInWithPassword.mockRejectedValue(new Error("network down"));

    render(<LoginForm />);
    fillAndSubmit();

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Error inesperado al iniciar sesión",
      ),
    );
  });

  it("validates the form and does not submit when invalid", async () => {
    render(<LoginForm />);
    fireEvent.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    expect(await screen.findByText("Email inválido")).toBeInTheDocument();
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it("continues with Google OAuth redirecting to /auth/callback", async () => {
    mocks.signInWithOAuth.mockResolvedValue({ error: null });

    render(<LoginForm />);
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

  it("shows an error toast when Google OAuth fails", async () => {
    mocks.signInWithOAuth.mockResolvedValue({
      error: { message: "OAuth error" },
    });

    render(<LoginForm />);
    fireEvent.click(
      screen.getByRole("button", { name: /continuar con google/i }),
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("OAuth error"),
    );
  });

  it("shows an error toast when Google OAuth throws", async () => {
    mocks.signInWithOAuth.mockRejectedValue(new Error("network down"));

    render(<LoginForm />);
    fireEvent.click(
      screen.getByRole("button", { name: /continuar con google/i }),
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Error al conectar con Google"),
    );
  });

  it("links to /register", () => {
    render(<LoginForm />);
    expect(screen.getByRole("link", { name: /regístrate/i })).toHaveAttribute(
      "href",
      "/register",
    );
  });
});
