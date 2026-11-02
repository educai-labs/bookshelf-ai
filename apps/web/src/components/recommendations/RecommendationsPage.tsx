"use client";

import { useCallback, useEffect, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getRecommendations } from "@/lib/api/recommendations";
import { useTranslation } from "@/lib/i18n";
import type { RecommendationItem } from "@/lib/validations/recommendations";

/** Nº de recomendaciones solicitadas al endpoint (default del backend). */
const REQUEST_LIMIT = 5;

/** Convierte el confidence (0-1) a un porcentaje entero (0-100). */
function confidencePercent(confidence: number): number {
  return Math.round(confidence * 100);
}

/** Skeleton del primer fetch: grid de 5 cards (espejo del grid real). */
function RecommendationsSkeleton({ label }: { label: string }) {
  return (
    <div
      className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      data-testid="recommendations-skeleton"
      aria-label={label}
    >
      {Array.from({ length: REQUEST_LIMIT }, (_, i) => (
        <Card key={i}>
          <CardHeader className="space-y-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-5 w-16" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * Página de recomendaciones (feature 018).
 *
 * Carga `GET /api/v1/ai/recommendations` con la sesión del usuario y muestra un
 * grid responsive de cards (título, autores, razón y badge de confidence) con
 * estados de carga, vacío y error con "Reintentar" (repite la petición sin
 * recargar ni navegar). Reutiliza `Card`, `Badge`, `Skeleton` y `Button`.
 *
 * Accesibilidad: `role="grid"` con `role="gridcell"` por card, `aria-live` para
 * los cambios de estado, foco visible (primitivos shadcn) y orden de teclado
 * lógico (lectura en orden de documento).
 */
export function RecommendationsPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState<RecommendationItem[] | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await getRecommendations(REQUEST_LIMIT);
      setItems(data.recommendations);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const hasItems = items !== null && items.length > 0;

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">{t("recommendations.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("recommendations.subtitle")}
        </p>
      </header>

      <div aria-live="polite">
        {error ? (
          <Alert variant="destructive" data-testid="recommendations-error">
            <AlertTitle>{t("recommendations.error.title")}</AlertTitle>
            <AlertDescription>
              {t("recommendations.error.description")}
            </AlertDescription>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void load()}
              data-testid="recommendations-retry"
            >
              {t("common.retry")}
            </Button>
          </Alert>
        ) : loading ? (
          <RecommendationsSkeleton label={t("recommendations.loadingAria")} />
        ) : !hasItems ? (
          <div
            className="flex flex-col items-center justify-center gap-2 py-16 text-center"
            data-testid="recommendations-empty"
          >
            <p className="text-lg font-medium">
              {t("recommendations.empty.title")}
            </p>
            <p className="max-w-md text-sm text-muted-foreground">
              {t("recommendations.empty.description")}
            </p>
          </div>
        ) : (
          <div
            role="grid"
            aria-label={t("recommendations.gridAria")}
            className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            data-testid="recommendations-grid"
          >
            {items?.map((item) => {
              const pct = confidencePercent(item.confidence);
              return (
                <Card
                  key={item.title}
                  role="gridcell"
                  className="flex flex-col"
                >
                  <CardHeader>
                    <CardTitle>{item.title}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {item.authors.join(", ")}
                    </p>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col justify-between gap-3">
                    <p className="text-sm">{item.reason}</p>
                    <Badge
                      variant="secondary"
                      aria-label={t("recommendations.confidenceAria", {
                        value: pct,
                      })}
                    >
                      {pct}%
                    </Badge>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
