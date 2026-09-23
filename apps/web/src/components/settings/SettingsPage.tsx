"use client";

import { useTranslation } from "@/lib/i18n";
import { AccessibilitySection } from "./AccessibilitySection";
import { AppearanceSection } from "./AppearanceSection";
import { ChatSection } from "./ChatSection";
import { NotificationsSection } from "./NotificationsSection";
import { PrivacySection } from "./PrivacySection";
import { ReaderSection } from "./ReaderSection";

/** Vista de configuración (feature 022): todas las secciones 3.1–3.7. */
export function SettingsPage() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">
          {t("settings.title")}
        </h1>
        <p className="text-muted-foreground">{t("settings.subtitle")}</p>
      </header>

      <AppearanceSection />
      <ReaderSection />
      <ChatSection />
      <NotificationsSection />
      <PrivacySection />
      <AccessibilitySection />
    </div>
  );
}
