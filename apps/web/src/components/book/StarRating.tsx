"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";

export type StarRatingSize = "sm" | "md" | "lg";

/** Tamaños coherentes (feature 030 · Z3-11): un solo mapa para los tres usos. */
const SIZE_CLASSES: Record<StarRatingSize, string> = {
  sm: "size-3",
  md: "size-4",
  lg: "size-5",
};

export interface StarRatingProps {
  /** Número de estrellas llenas (0..max). */
  value: number;
  /** Máximo de estrellas (default 5). */
  max?: number;
  /** Tamaño visual (mapa único compartido). */
  size?: StarRatingSize;
  /** Modo interactivo: botones con roles radio y navegación de teclado. */
  interactive?: boolean;
  /** Callback al pulsar la estrella `i` (1-based) en modo interactivo. */
  onChange?: (value: number) => void;
  /** Deshabilita la interacción (modo interactivo). */
  disabled?: boolean;
  /** Nombre accesible del contenedor (aria-label). */
  ariaLabel?: string;
  /** Clases extra sobre el contenedor. */
  className?: string;
}

/** SVG de estrella único: dibujo, color y tamaño compartidos. */
function StarIcon({ filled, size }: { filled: boolean; size: StarRatingSize }) {
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
 * Primitivo único de estrellas (feature 030 · Z3-11).
 *
 * Centraliza el dibujo, los tamaños y los colores en un único componente con
 * dos modos:
 * - readonly (`role="img"` + aria-label): usado por `RatingStars` y `BookHeader`.
 * - interactivo (`role="radiogroup"` con botones `role="radio"`): usado por
 *   `InteractiveRatingStars`.
 */
export function StarRating({
  value,
  max = 5,
  size = "md",
  interactive = false,
  onChange,
  disabled = false,
  ariaLabel,
  className,
}: StarRatingProps) {
  const filledCount = Math.max(0, Math.min(value, max));
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function handleClick(index: number) {
    if (disabled || !interactive) return;
    onChange?.(index + 1);
  }

  function handleKeyDown(event: React.KeyboardEvent, index: number) {
    if (disabled || !interactive) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleClick(index);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      buttonRefs.current[Math.min(index + 1, max - 1)]?.focus();
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      buttonRefs.current[Math.max(index - 1, 0)]?.focus();
    }
  }

  if (interactive) {
    return (
      <div
        role="radiogroup"
        aria-label={ariaLabel}
        aria-readonly={disabled}
        className={cn("flex items-center gap-1", className)}
      >
        {Array.from({ length: max }, (_, i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={i < filledCount}
            aria-posinset={i + 1}
            aria-setsize={max}
            tabIndex={disabled ? -1 : 0}
            disabled={disabled}
            ref={(el) => {
              buttonRefs.current[i] = el;
            }}
            onClick={() => handleClick(i)}
            onKeyDown={(e) => handleKeyDown(e, i)}
            className={cn(
              "rounded p-0.5 transition-colors",
              "hover:scale-110 active:scale-95",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2",
              disabled && "cursor-not-allowed opacity-50",
            )}
          >
            <StarIcon filled={i < filledCount} size={size} />
          </button>
        ))}
      </div>
    );
  }

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className={cn("flex items-center gap-0.5", className)}
    >
      {Array.from({ length: max }, (_, i) => (
        <StarIcon key={i} filled={i < filledCount} size={size} />
      ))}
    </div>
  );
}
