"use client";

import { Button } from "@/components/ui/button";
import { AddBookModal } from "@/components/books/AddBookModal";
import { useTranslation } from "@/lib/i18n";

/** Ilustración SVG inline del estado vacío. */
function LibraryEmptyIllustration() {
  return (
    <svg
      viewBox="0 0 120 120"
      aria-hidden="true"
      className="size-24 text-muted-foreground/50"
    >
      <rect
        x="18"
        y="26"
        width="28"
        height="68"
        rx="4"
        fill="currentColor"
        opacity="0.5"
      />
      <rect
        x="46"
        y="14"
        width="28"
        height="80"
        rx="4"
        fill="currentColor"
        opacity="0.75"
      />
      <rect
        x="74"
        y="32"
        width="28"
        height="62"
        rx="4"
        fill="currentColor"
        opacity="0.4"
      />
    </svg>
  );
}

/**
 * Estado vacío del Library Grid (feature 013): ilustración + mensaje
 * "Tu biblioteca está vacía" + botón que abre el modal de alta (feature 014).
 */
export function EmptyState() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <LibraryEmptyIllustration />
      <div className="space-y-1">
        <p className="text-lg font-medium">{t("dashboard.empty.title")}</p>
        <p className="text-sm text-muted-foreground">
          {t("dashboard.empty.subtitle")}
        </p>
      </div>
      <AddBookModal>
        <Button data-testid="add-first-book">
          {t("dashboard.empty.addFirst")}
        </Button>
      </AddBookModal>
    </div>
  );
}
