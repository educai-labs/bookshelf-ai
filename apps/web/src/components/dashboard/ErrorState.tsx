"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

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
export function ErrorState({
  message = "No se pudieron cargar los libros. Inténtalo de nuevo.",
  onRetry,
}: ErrorStateProps) {
  return (
    <Alert variant="destructive" className="my-8" data-testid="error-state">
      <AlertTitle>Error al cargar los libros</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
      <Button
        variant="outline"
        size="sm"
        className="mt-3"
        onClick={onRetry}
        data-testid="retry-button"
      >
        Reintentar
      </Button>
    </Alert>
  );
}
