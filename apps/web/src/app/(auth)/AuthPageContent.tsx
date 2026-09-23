"use client";

import { AlertCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useTranslation } from "@/lib/i18n";

/**
 * Contenido público de login/register (feature 012) traducido (feature 022).
 * El `page.tsx` (Server Component) solo aporta `metadata` y delega aquí el
 * header, el mensaje de error OAuth y el formulario (children).
 */
export function AuthPageContent({
  mode,
  error,
  children,
}: {
  mode: "login" | "register";
  error?: string;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight">Bookshelf</h1>
        <p className="text-muted-foreground">
          {mode === "login"
            ? t("auth.login.welcomeBack")
            : t("auth.register.subtitle")}
        </p>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>{t("auth.error.title")}</AlertTitle>
          <AlertDescription>{t("auth.error.description")}</AlertDescription>
        </Alert>
      ) : null}
      {children}
    </div>
  );
}
