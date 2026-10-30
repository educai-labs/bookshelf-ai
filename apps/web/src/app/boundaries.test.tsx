import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ErrorBoundary from "./error";
import GlobalError from "./global-error";
import NotFound from "./not-found";

function makeError(): Error & { digest?: string } {
  return Object.assign(new Error("boom"), { digest: "abc123" });
}

describe("error boundaries del App Router (feature 028)", () => {
  beforeEach(() => {
    // Silencia el log del boundary y las advertencias de anidamiento DOM.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("not-found.tsx muestra la UI propia con acción de volver al dashboard", () => {
    render(<NotFound />);

    expect(
      screen.getByRole("heading", { name: "Página no encontrada" }),
    ).toBeInTheDocument();
    const back = screen.getByRole("link", { name: "Volver al dashboard" });
    expect(back).toHaveAttribute("href", "/dashboard");
  });

  it("error.tsx muestra la UI propia y reintenta al pulsar el botón", async () => {
    const reset = vi.fn();
    const user = userEvent.setup();

    render(<ErrorBoundary error={makeError()} reset={reset} />);

    expect(
      screen.getByRole("heading", { name: "Algo salió mal" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("global-error.tsx emite su propio <html>/<body> y un botón de recarga", () => {
    const { container } = render(
      <GlobalError error={makeError()} reset={() => {}} />,
    );

    expect(container.querySelector("html")).toBeInTheDocument();
    expect(container.querySelector("body")).toBeInTheDocument();
    expect(container.querySelector("html")).toHaveAttribute("lang");
    expect(
      screen.getByRole("button", { name: "Recargar página" }),
    ).toBeInTheDocument();
  });
});
