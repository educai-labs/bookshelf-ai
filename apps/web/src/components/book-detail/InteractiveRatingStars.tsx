"use client";

import { StarRating, type StarRatingSize } from "@/components/book/StarRating";

export type RatingStarSize = StarRatingSize;

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

/**
 * Estrellas de rating interactivas (5 botones).
 * Click en estrella i → set rating = i+1.
 * Click en la misma estrella → set rating = null (borra).
 *
 * Reutiliza el primitivo compartido `StarRating` (feature 030) en modo
 * interactivo, conservando la interacción y la semántica ARIA existentes
 * (radiogroup/radio + navegación de teclado).
 */
export function InteractiveRatingStars({
  rating,
  onChange,
  ariaLabel = "Rating",
  size = "md",
  disabled = false,
}: InteractiveRatingStarsProps) {
  const filledCount = rating !== null ? rating : 0;

  const handleChange = (value: number) => {
    // Click en la misma estrella llena → borra el rating.
    onChange(value === rating ? null : value);
  };

  return (
    <StarRating
      interactive
      value={filledCount}
      size={size}
      onChange={handleChange}
      disabled={disabled}
      ariaLabel={ariaLabel}
    />
  );
}
