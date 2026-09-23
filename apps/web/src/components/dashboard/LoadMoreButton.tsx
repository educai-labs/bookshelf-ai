"use client";

import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";

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
  const { t } = useTranslation();
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
          {t("common.loading")}
        </>
      ) : (
        t("dashboard.loadMore")
      )}
    </Button>
  );
}
