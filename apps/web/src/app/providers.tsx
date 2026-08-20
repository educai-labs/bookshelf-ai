"use client";

import type { ReactNode } from "react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";

import { SessionProvider } from "@/components/providers/SessionProvider";

/**
 * Providers globales del layout raíz:
 * - `SessionProvider`: contexto de sesión (user/session) para Client Components.
 * - `ThemeProvider` (next-themes): dark mode via `class` strategy.
 * - `Toaster` (sonner): toasts globales.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        {children}
        <Toaster />
      </ThemeProvider>
    </SessionProvider>
  );
}
