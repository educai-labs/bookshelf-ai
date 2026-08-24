"use client";

import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

export interface LoadMoreButtonProps {
  onClick: () => void;
  isLoadingMore: boolean;
  /** Deshabilita si no queda más por cargar. */
  hasMore: boolean;
}

/**
 * Botón de paginación "Cargar más" (feature 013): full-width, outline, spinner
 * mientras carga; deshabilitado si `isLoadingMore` o `!hasMore`.
 */
export function LoadMoreButton({
  onClick,
  isLoadingMore,
  hasMore,
}: LoadMoreButtonProps) {
  return (
    <Button
      variant="outline"
      size="lg"
      className="w-full"
      onClick={onClick}
      disabled={isLoadingMore || !hasMore}
      data-testid="load-more"
    >
      {isLoadingMore ? (
        <>
          <Loader2 className="animate-spin" aria-hidden="true" />
          Cargando...
        </>
      ) : (
        "Cargar más"
      )}
    </Button>
  );
}
