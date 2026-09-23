"use client";

import { useSettings } from "@/contexts/SettingsContext";
import { useTranslation } from "@/lib/i18n";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SectionCard } from "./SectionCard";
import type { Language, ThemePreference } from "@/types/settings";

/** Sección 3.1 (apariencia) + 3.2 (idioma): tema e idioma con aplicación inmediata. */
export function AppearanceSection() {
  const { t } = useTranslation();
  const { theme, setTheme, language, setLanguage } = useSettings();

  return (
    <SectionCard
      title={t("settings.sections.appearance")}
      description={t("settings.appearance.themeDescription")}
    >
      <div className="space-y-2">
        <p className="text-sm font-medium">
          {t("settings.appearance.themeLabel")}
        </p>
        <Select
          value={theme}
          onValueChange={(value) => setTheme(value as ThemePreference)}
        >
          <SelectTrigger
            aria-label={t("settings.appearance.themeLabel")}
            className="w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="light">
              {t("settings.appearance.light")}
            </SelectItem>
            <SelectItem value="dark">
              {t("settings.appearance.dark")}
            </SelectItem>
            <SelectItem value="system">
              {t("settings.appearance.system")}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">{t("settings.language.label")}</p>
        <Select
          value={language}
          onValueChange={(value) => setLanguage(value as Language)}
        >
          <SelectTrigger
            aria-label={t("settings.language.label")}
            className="w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="es">{t("settings.language.es")}</SelectItem>
            <SelectItem value="en">{t("settings.language.en")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </SectionCard>
  );
}
