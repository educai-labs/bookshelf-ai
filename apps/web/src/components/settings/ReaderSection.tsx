"use client";

import { useSettings } from "@/contexts/SettingsContext";
import { useTranslation } from "@/lib/i18n";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SectionCard, SettingRow } from "./SectionCard";
import type { ReadingFont } from "@/types/settings";

/** Sección 3.3: preferencias del lector con rangos de validación. */
export function ReaderSection() {
  const { t } = useTranslation();
  const { settings, updateReader } = useSettings();
  const reader = settings.reader;

  return (
    <SectionCard title={t("settings.sections.reader")}>
      <div className="space-y-4">
        {/* Tamaño de texto (14-22) */}
        <div className="space-y-2">
          <label htmlFor="reader-font-size" className="text-sm font-medium">
            {t("settings.reader.fontSize")}
            <span className="ml-2 font-normal text-muted-foreground">
              {reader.fontSize}
              {t("settings.reader.px")}
            </span>
          </label>
          <input
            id="reader-font-size"
            type="range"
            min={14}
            max={22}
            step={1}
            value={reader.fontSize}
            onChange={(e) => updateReader({ fontSize: Number(e.target.value) })}
            className="w-full"
          />
        </div>

        {/* Ancho del área (480-960) */}
        <div className="space-y-2">
          <label htmlFor="reader-line-width" className="text-sm font-medium">
            {t("settings.reader.lineWidth")}
            <span className="ml-2 font-normal text-muted-foreground">
              {reader.lineWidth}
              {t("settings.reader.px")}
            </span>
          </label>
          <input
            id="reader-line-width"
            type="range"
            min={480}
            max={960}
            step={40}
            value={reader.lineWidth}
            onChange={(e) =>
              updateReader({ lineWidth: Number(e.target.value) })
            }
            className="w-full"
          />
        </div>

        {/* Interlineado (1.4-2.0) */}
        <div className="space-y-2">
          <label htmlFor="reader-line-height" className="text-sm font-medium">
            {t("settings.reader.lineHeight")}
            <span className="ml-2 font-normal text-muted-foreground">
              {reader.lineHeight.toFixed(1)}
            </span>
          </label>
          <input
            id="reader-line-height"
            type="range"
            min={1.4}
            max={2.0}
            step={0.1}
            value={reader.lineHeight}
            onChange={(e) =>
              updateReader({ lineHeight: Number(e.target.value) })
            }
            className="w-full"
          />
        </div>

        {/* Fuente */}
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("settings.reader.font")}</p>
          <Select
            value={reader.font}
            onValueChange={(value) =>
              updateReader({ font: value as ReadingFont })
            }
          >
            <SelectTrigger
              aria-label={t("settings.reader.font")}
              className="w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="system">
                {t("settings.reader.fontSystem")}
              </SelectItem>
              <SelectItem value="serif">
                {t("settings.reader.fontSerif")}
              </SelectItem>
              <SelectItem value="sans">
                {t("settings.reader.fontSans")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <SettingRow
          id="reader-show-details"
          label={t("settings.reader.showBookDetails")}
        >
          <Switch
            id="reader-show-details"
            checked={reader.showBookDetails}
            onCheckedChange={(showBookDetails) =>
              updateReader({ showBookDetails })
            }
          />
        </SettingRow>

        <SettingRow
          id="reader-confirm"
          label={t("settings.reader.confirmDeletions")}
        >
          <Switch
            id="reader-confirm"
            checked={reader.confirmDeletions}
            onCheckedChange={(confirmDeletions) =>
              updateReader({ confirmDeletions })
            }
          />
        </SettingRow>
      </div>
    </SectionCard>
  );
}
