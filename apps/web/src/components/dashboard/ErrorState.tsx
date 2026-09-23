"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";

export interface ErrorStateProps {
  /** Mensaje del error (por defecto genérico). */
  message?: string;
  /** Reintenta el primer fetch. */
  onRetry: () => void;
}

/**
 * Estado de error del Library Grid (feature 013): `Alert` destructive con
 * mensaje + botón "Reintentar".
 */
export function ErrorState({ message, onRetry }: ErrorStateProps) {
  const { t } = useTranslation();
  const defaultMessage = t("dashboard.error.default");
  return (
    <Alert variant="destructive" className="my-8" data-testid="error-state">
      <AlertTitle>{t("dashboard.error.title")}</AlertTitle>
      <AlertDescription>{message ?? defaultMessage}</AlertDescription>
      <Button
        variant="outline"
        size="sm"
        className="mt-3"
        onClick={onRetry}
        data-testid="retry-button"
      >
        {t("common.retry")}
      </Button>
    </Alert>
  );
}
