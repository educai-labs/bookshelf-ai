"use client";

import type { ReactNode } from "react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";

/**
 * Providers globales del layout raíz:
 * - `ThemeProvider` (next-themes): dark mode via `class` strategy.
 * - `Toaster` (sonner): toasts globales (login, register, logout, …).
 *
 * Nota: `SessionProvider` NO vive aquí — solo envuelve el área protegida
 * `(dashboard)` para no forzar client-side en páginas públicas (SEO/performance).
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
      <Toaster />
    </ThemeProvider>
  );
}
