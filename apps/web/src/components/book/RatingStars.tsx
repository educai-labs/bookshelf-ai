"use client";

import { useTranslation } from "@/lib/i18n";
import { StarRating, type StarRatingSize } from "./StarRating";

export type RatingStarSize = StarRatingSize;

export interface RatingStarsProps {
  /** Rating del libro (1-5) o `null` si aún no tiene. */
  rating: number | null;
  /** Máximo de estrellas (default 5). */
  max?: number;
  /** Tamaño visual de las estrellas. */
  size?: RatingStarSize;
}

/**
 * Estrellas de rating readonly (sin interacción). Rellenas en `amber-500`
 * hasta `rating`; grises (`muted`) a partir de ahí. Con `rating = null`
 * todas quedan grises. Accesible vía `role="img"` + `aria-label`.
 *
 * Reutiliza el primitivo compartido `StarRating` (feature 030) en modo
 * readonly, delegando dibujo/tamaño/color a un único lugar.
 */
export function RatingStars({
  rating,
  max = 5,
  size = "md",
}: RatingStarsProps) {
  const filled = rating !== null && rating > 0;
  const count = filled ? Math.min(rating, max) : 0;
  const { t } = useTranslation();

  return (
    <StarRating
      value={count}
      max={max}
      size={size}
      ariaLabel={t("rating.aria", { count, max })}
    />
  );
}
