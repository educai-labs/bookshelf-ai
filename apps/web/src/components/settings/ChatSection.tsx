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
import type { ChatInitialMode } from "@/types/settings";

/** Sección 3.4: preferencias del chat (el modelo de IA no es configurable). */
export function ChatSection() {
  const { t } = useTranslation();
  const { settings, updateChat } = useSettings();
  const chat = settings.chat;

  return (
    <SectionCard title={t("settings.sections.chat")}>
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm font-medium">
            {t("settings.chat.initialMode")}
          </p>
          <Select
            value={chat.initialMode}
            onValueChange={(value) =>
              updateChat({ initialMode: value as ChatInitialMode })
            }
          >
            <SelectTrigger
              aria-label={t("settings.chat.initialMode")}
              className="w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="book">
                {t("settings.chat.initialModeBook")}
              </SelectItem>
              <SelectItem value="library">
                {t("settings.chat.initialModeLibrary")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <SettingRow
          id="chat-show-history"
          label={t("settings.chat.showHistory")}
        >
          <Switch
            id="chat-show-history"
            checked={chat.showHistory}
            onCheckedChange={(showHistory) => updateChat({ showHistory })}
          />
        </SettingRow>

        <SettingRow
          id="chat-clear-logout"
          label={t("settings.chat.clearOnLogout")}
        >
          <Switch
            id="chat-clear-logout"
            checked={chat.clearHistoryOnLogout}
            onCheckedChange={(clearHistoryOnLogout) =>
              updateChat({ clearHistoryOnLogout })
            }
          />
        </SettingRow>

        <SettingRow
          id="chat-respond-lang"
          label={t("settings.chat.respondInLang")}
        >
          <Switch
            id="chat-respond-lang"
            checked={chat.respondInInterfaceLanguage}
            onCheckedChange={(respondInInterfaceLanguage) =>
              updateChat({ respondInInterfaceLanguage })
            }
          />
        </SettingRow>

        <SettingRow
          id="chat-auto-recommendations"
          label={t("settings.chat.autoRecommendations")}
        >
          <Switch
            id="chat-auto-recommendations"
            checked={chat.autoRecommendations}
            onCheckedChange={(autoRecommendations) =>
              updateChat({ autoRecommendations })
            }
          />
        </SettingRow>

        <p className="text-xs text-muted-foreground">
          {t("settings.chat.noModelNote")}
        </p>
      </div>
    </SectionCard>
  );
}
