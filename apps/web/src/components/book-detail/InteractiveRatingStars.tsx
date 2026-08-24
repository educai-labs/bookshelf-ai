"use client";

import { cn } from "@/lib/utils";

export type RatingStarSize = "sm" | "md" | "lg";

export interface InteractiveRatingStarsProps {
  /** Rating actual (1-5) o null si no tiene. */
  rating: number | null;
  /** Callback al cambiar el rating. */
  onChange: (rating: number | null) => void;
  /** Texto de ayuda para screen readers. */
  ariaLabel?: string;
  /** Tamaño visual. */
  size?: RatingStarSize;
  /** Si está deshabilitado (ej. guardando). */
  disabled?: boolean;
}

const SIZE_CLASSES: Record<RatingStarSize, string> = {
  sm: "size-4",
  md: "size-5",
  lg: "size-6",
};

/** Path de estrella (lucide-react Star). */
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
 * Estrellas de rating interactivas (5 botones).
 * Click en estrella i → set rating = i+1.
 * Click en la misma estrella → set rating = null (borra).
 */
export function InteractiveRatingStars({
  rating,
  onChange,
  ariaLabel = "Rating",
  size = "md",
  disabled = false,
}: InteractiveRatingStarsProps) {
  const filledCount = rating !== null ? rating : 0;

  const handleClick = (index: number) => {
    if (disabled) return;
    // Si clicla la misma estrella que está llena, borra el rating
    const newRating = index + 1 === rating ? null : index + 1;
    onChange(newRating);
  };

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (disabled) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleClick(index);
    }
    if (event.key === "ArrowRight" && index < 4) {
      event.preventDefault();
      // Focus next star handled by browser tab order
    }
    if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-readonly={disabled}
      className="flex items-center gap-1"
    >
      {Array.from({ length: 5 }, (_, i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={i < filledCount}
          aria-posinset={i + 1}
          aria-setsize={5}
          tabIndex={disabled ? -1 : 0}
          disabled={disabled}
          onClick={() => handleClick(i)}
          onKeyDown={(e) => handleKeyDown(e, i)}
          className={cn(
            "rounded p-0.5 transition-colors",
            "hover:scale-110 active:scale-95",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2",
            disabled && "cursor-not-allowed opacity-50",
          )}
        >
          <StarPath filled={i < filledCount} size={size} />
        </button>
      ))}
    </div>
  );
}
