"use client";

import { useSettings } from "@/contexts/SettingsContext";
import { useTranslation } from "@/lib/i18n";
import { Switch } from "@/components/ui/switch";
import { SectionCard, SettingRow } from "./SectionCard";

/** Sección 3.5: preferencias de notificaciones. */
export function NotificationsSection() {
  const { t } = useTranslation();
  const { settings, updateNotifications } = useSettings();
  const n = settings.notifications;

  return (
    <SectionCard title={t("settings.sections.notifications")}>
      <SettingRow id="notif-errors" label={t("settings.notifications.errors")}>
        <Switch
          id="notif-errors"
          checked={n.errors}
          onCheckedChange={(errors) => updateNotifications({ errors })}
        />
      </SettingRow>
      <SettingRow
        id="notif-vectorization"
        label={t("settings.notifications.vectorizationDone")}
      >
        <Switch
          id="notif-vectorization"
          checked={n.vectorizationDone}
          onCheckedChange={(vectorizationDone) =>
            updateNotifications({ vectorizationDone })
          }
        />
      </SettingRow>
      <SettingRow
        id="notif-recommendations"
        label={t("settings.notifications.recommendations")}
      >
        <Switch
          id="notif-recommendations"
          checked={n.recommendations}
          onCheckedChange={(recommendations) =>
            updateNotifications({ recommendations })
          }
        />
      </SettingRow>
      <SettingRow
        id="notif-account"
        label={t("settings.notifications.account")}
      >
        <Switch
          id="notif-account"
          checked={n.account}
          onCheckedChange={(account) => updateNotifications({ account })}
        />
      </SettingRow>
    </SectionCard>
  );
}
