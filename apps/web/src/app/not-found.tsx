"use client";

import Link from "next/link";
import { FileQuestion } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";

/**
 * Página 404 global del App Router (feature 028): sustituye la pantalla por
 * defecto de Next con UI shadcn + textos i18n y una acción de volver al
 * dashboard.
 */
export default function NotFound() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <FileQuestion
        className="size-12 text-muted-foreground"
        aria-hidden="true"
      />
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{t("error.notFoundTitle")}</h1>
        <p className="text-muted-foreground">
          {t("error.notFoundDescription")}
        </p>
      </div>
      <Button asChild>
        <Link href="/dashboard">{t("error.backToDashboard")}</Link>
      </Button>
    </div>
  );
}
