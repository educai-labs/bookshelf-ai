"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { translate, type TranslationKey } from "@/lib/i18n";
import { readClientLanguage } from "@/lib/settings/language";

/**
 * Boundary de error global (feature 028): se renderiza FUERA del layout raíz
 * (reemplaza todo el documento), por lo que emite su propio `<html>`/`<body>`
 * válidos y no puede depender de `SettingsContext`. Lee el idioma de la cookie
 * `bookshelf:language` y usa `translate()` puro para los textos i18n.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [lang, setLang] = useState<"es" | "en">("es");

  useEffect(() => {
    const cookieLang = readClientLanguage();
    if (cookieLang) {
      setLang(cookieLang);
    }
    console.error(error);
  }, [error]);

  const t = (key: TranslationKey) => translate(lang, key);

  return (
    <html lang={lang}>
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
          <AlertTriangle
            className="size-12 text-destructive"
            aria-hidden="true"
          />
          <div className="space-y-1">
            <h1 className="text-2xl font-bold">{t("error.title")}</h1>
            <p className="text-muted-foreground">{t("error.description")}</p>
          </div>
          <Button onClick={() => window.location.reload()}>
            {t("error.reload")}
          </Button>
        </div>
      </body>
    </html>
  );
}
