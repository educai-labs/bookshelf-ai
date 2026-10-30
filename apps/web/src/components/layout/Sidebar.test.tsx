import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { isKnownRoute } from "@/lib/navigation/routes";
import { Sidebar } from "./Sidebar";

const mocks = vi.hoisted(() => ({
  pathname: "/dashboard",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
}));

// `useTranslation` lee el idioma de `SettingsContext`; al renderizar `Sidebar`
// aislado (sin `SettingsProvider`) se usa el contexto fallback (idioma `es`).
function renderSidebar() {
  return render(<Sidebar />);
}

describe("Sidebar", () => {
  beforeEach(() => {
    mocks.pathname = "/dashboard";
  });

  describe("destinos y enlace activo", () => {
    it("solo apunta a rutas definidas en el App Router", () => {
      renderSidebar();
      const links = screen.getAllByRole("link");
      expect(links.length).toBeGreaterThan(0);
      for (const link of links) {
        const href = link.getAttribute("href") ?? "";
        expect(isKnownRoute(href), `ruta no definida: ${href}`).toBe(true);
      }
    });

    it("expone aria-current='page' solo en el enlace activo", () => {
      mocks.pathname = "/settings";
      renderSidebar();

      const settingsLink = screen.getByRole("link", { name: "Configuración" });
      expect(settingsLink).toHaveAttribute("aria-current", "page");

      const dashboardLink = screen.getByRole("link", { name: "Dashboard" });
      expect(dashboardLink).not.toHaveAttribute("aria-current");
    });

    it("marca como activa una subruta de /dashboard", () => {
      mocks.pathname = "/dashboard/filtros";
      renderSidebar();
      expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
        "aria-current",
        "page",
      );
    });
  });

  describe("drawer móvil", () => {
    it("empieza cerrado por defecto", () => {
      renderSidebar();
      expect(screen.queryByTestId("sidebar-drawer")).not.toBeInTheDocument();
      expect(screen.queryByTestId("sidebar-overlay")).not.toBeInTheDocument();
    });

    it("se abre con el botón de menú (overlay + drawer visibles)", async () => {
      const user = userEvent.setup();
      renderSidebar();

      const button = screen.getByRole("button", { name: "Abrir menú" });
      expect(button).toHaveAttribute("aria-haspopup", "dialog");
      expect(button).toHaveAttribute("aria-expanded", "false");

      await user.click(button);

      expect(await screen.findByTestId("sidebar-drawer")).toBeInTheDocument();
      expect(screen.getByTestId("sidebar-overlay")).toBeInTheDocument();
      expect(button).toHaveAttribute("aria-expanded", "true");
    });

    it("se cierra con Escape", async () => {
      const user = userEvent.setup();
      renderSidebar();

      await user.click(screen.getByRole("button", { name: "Abrir menú" }));
      expect(await screen.findByTestId("sidebar-drawer")).toBeInTheDocument();

      await user.keyboard("{Escape}");

      await waitFor(() =>
        expect(screen.queryByTestId("sidebar-drawer")).not.toBeInTheDocument(),
      );
    });

    it("se cierra al hacer click en el overlay", async () => {
      const user = userEvent.setup();
      renderSidebar();

      await user.click(screen.getByRole("button", { name: "Abrir menú" }));
      await screen.findByTestId("sidebar-drawer");

      await user.click(screen.getByTestId("sidebar-overlay"));

      await waitFor(() =>
        expect(screen.queryByTestId("sidebar-drawer")).not.toBeInTheDocument(),
      );
    });

    it("se cierra con el botón de cerrar (teclado/click)", async () => {
      const user = userEvent.setup();
      renderSidebar();

      await user.click(screen.getByRole("button", { name: "Abrir menú" }));
      await screen.findByTestId("sidebar-drawer");

      await user.click(screen.getByRole("button", { name: "Cerrar menú" }));

      await waitFor(() =>
        expect(screen.queryByTestId("sidebar-drawer")).not.toBeInTheDocument(),
      );
    });
  });
});
