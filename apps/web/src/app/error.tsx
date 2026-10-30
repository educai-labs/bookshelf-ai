"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";

/**
 * Boundary de error del App Router (feature 028): captura throws de Server o
 * Client Components y muestra una UI shadcn + i18n con botón de reintento
 * (`reset`), en lugar de la pantalla por defecto de Next.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useTranslation();

  useEffect(() => {
    // El detalle no se expone al usuario; solo se registra en consola.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <AlertTriangle className="size-12 text-destructive" aria-hidden="true" />
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{t("error.title")}</h1>
        <p className="text-muted-foreground">{t("error.description")}</p>
      </div>
      <Button onClick={() => reset()} data-testid="error-reset">
        {t("error.retry")}
      </Button>
    </div>
  );
}
