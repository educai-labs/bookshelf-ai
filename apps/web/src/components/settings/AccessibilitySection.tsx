"use client";

import { useSettings } from "@/contexts/SettingsContext";
import { useTranslation } from "@/lib/i18n";
import { SectionCard } from "./SectionCard";

/** Sección 3.7: accesibilidad (reduced motion sigue al sistema operativo). */
export function AccessibilitySection() {
  const { t } = useTranslation();
  const { reducedMotion } = useSettings();

  return (
    <SectionCard title={t("settings.sections.accessibility")}>
      <p className="text-sm text-muted-foreground">
        {t("settings.accessibility.reducedMotion")}:{" "}
        {reducedMotion
          ? t("settings.accessibility.enabled")
          : t("settings.accessibility.disabled")}
      </p>
    </SectionCard>
  );
}
