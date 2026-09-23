"use client";

import React, { type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";

import { SettingsProvider } from "@/contexts/SettingsContext";

/**
 * Providers globales del layout raíz:
 * - `ThemeProvider` (next-themes): dark mode via `class` strategy (tema local,
 *   aplica sin recarga; lo consume `SettingsProvider`).
 * - `SettingsProvider` (feature 022): contexto único de preferencias del
 *   cliente (tema, idioma, lector, chat, notificaciones, privacidad,
 *   accesibilidad e historial del chat). Debe estar DENTRO de `ThemeProvider`
 *   para poder usar `useTheme`.
 * - `QueryClientProvider` (@tanstack/react-query): cache y mutaciones (014).
 * - `Toaster` (sonner): toasts globales.
 *
 * Nota: `SessionProvider` NO vive aquí — solo envuelve el área protegida
 * `(dashboard)` para no forzar client-side en páginas públicas (SEO/performance).
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 5, // 5 min
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <SettingsProvider>
          {children}
          <Toaster />
        </SettingsProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
