import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { cookies } from "next/headers";

import "./globals.css";
import { Providers } from "./providers";
import { LANGUAGE_COOKIE_NAME, resolveLanguage } from "@/lib/settings/language";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Bookshelf",
  description:
    "Bookshelf — gestor personal de biblioteca con búsqueda semántica",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Fuente SSR del idioma: `localStorage` no existe en el servidor, así que se
  // lee la cookie de preferencia (`bookshelf:language`). `SettingsContext` la
  // mantiene sincronizada en el cliente; fallback `es` si falta o es inválida.
  const lang = resolveLanguage(cookies().get(LANGUAGE_COOKIE_NAME)?.value);

  return (
    <html lang={lang} suppressHydrationWarning>
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
