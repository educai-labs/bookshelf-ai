"use client";

import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";

export type RatingStarSize = "sm" | "md" | "lg";

export interface RatingStarsProps {
  /** Rating del libro (1-5) o `null` si aún no tiene. */
  rating: number | null;
  /** Máximo de estrellas (default 5). */
  max?: number;
  /** Tamaño visual de las estrellas. */
  size?: RatingStarSize;
}

const SIZE_CLASSES: Record<RatingStarSize, string> = {
  sm: "size-3",
  md: "size-4",
  lg: "size-5",
};

/** Forma de estrella (Path de lucide/heroicons "star"). */
function StarPath({ filled, size }: { filled: boolean; size: RatingStarSize }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn(
        SIZE_CLASSES[size],
        filled ? "fill-amber-500 text-amber-500" : "fill-muted text-muted",
      )}
    >
      <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
    </svg>
  );
}

/**
 * Estrellas de rating readonly (sin interacción). Rellenas en `amber-500`
 * hasta `rating`; grises (`muted`) a partir de ahí. Con `rating = null`
 * todas quedan grises. Accesible vía `role="img"` + `aria-label`.
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
    <div
      role="img"
      aria-label={t("rating.aria", { count, max })}
      className="flex items-center gap-0.5"
    >
      {Array.from({ length: max }, (_, i) => (
        <StarPath key={i} filled={i < count} size={size} />
      ))}
    </div>
  );
}
