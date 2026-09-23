"use client";

import { useSettings } from "@/contexts/SettingsContext";
import { useTranslation } from "@/lib/i18n";
import { formatDateShort } from "@/lib/formatters";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { SectionCard, SettingRow } from "./SectionCard";
import { ConfirmDialog } from "./ConfirmDialog";
import {
  useClearLocalHistory,
  useDeleteAccount,
  useExportData,
  useSignOut,
  useStoredData,
} from "@/lib/hooks/useSettings";

/** Sección 3.6: privacidad y datos (acciones server-side + historial local). */
export function PrivacySection() {
  const { t, language } = useTranslation();
  const { settings, updatePrivacy, restoreDefaults } = useSettings();
  const privacy = settings.privacy;

  const storedData = useStoredData();
  const exportMutation = useExportData();
  const deleteAccountMutation = useDeleteAccount();
  const signOutMutation = useSignOut();
  const clearHistoryMutation = useClearLocalHistory();

  function handleDownload() {
    exportMutation.mutate(undefined, {
      onSuccess: (data) => {
        const blob = new Blob([JSON.stringify(data, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `bookshelf-export-${Date.now()}.json`;
        anchor.click();
        URL.revokeObjectURL(url);
      },
    });
  }

  return (
    <SectionCard title={t("settings.sections.privacy")}>
      <SettingRow
        id="privacy-use-notes"
        label={t("settings.privacy.useNotesForSearch")}
      >
        <Switch
          id="privacy-use-notes"
          checked={privacy.useNotesForSearch}
          onCheckedChange={(useNotesForSearch) =>
            updatePrivacy({ useNotesForSearch })
          }
        />
      </SettingRow>

      {/* Consulta de datos almacenados */}
      <div className="rounded-md border p-4">
        <p className="text-sm font-medium">{t("settings.privacy.dataTitle")}</p>
        <p className="mb-3 text-xs text-muted-foreground">
          {t("settings.privacy.dataDescription")}
        </p>
        <ul className="space-y-1 text-sm">
          <li>
            {t("settings.privacy.books")}: {storedData.data?.books ?? "—"}
          </li>
          <li>
            {t("settings.privacy.notes")}: {storedData.data?.notes ?? "—"}
          </li>
          <li className="text-muted-foreground">
            {t("settings.privacy.preferencesUpdated")}:{" "}
            {storedData.data?.preferences_updated_at
              ? formatDateShort(
                  language,
                  storedData.data.preferences_updated_at,
                )
              : t("settings.privacy.never")}
          </li>
        </ul>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button
          variant="outline"
          onClick={handleDownload}
          disabled={exportMutation.isPending}
        >
          {t("settings.privacy.export")}
        </Button>
        <Button
          variant="outline"
          onClick={() => signOutMutation.mutate()}
          disabled={signOutMutation.isPending}
        >
          {t("settings.privacy.signOut")}
        </Button>
        <ConfirmDialog
          triggerLabel={t("settings.privacy.clearHistory")}
          title={t("settings.privacy.clearHistory")}
          description={t("settings.privacy.clearHistoryConfirm")}
          confirmLabel={t("common.confirm")}
          cancelLabel={t("common.cancel")}
          onConfirm={() => clearHistoryMutation.mutate()}
        />
        <ConfirmDialog
          triggerLabel={t("settings.restore.button")}
          title={t("settings.restore.title")}
          description={t("settings.restore.confirm")}
          confirmLabel={t("common.restore")}
          cancelLabel={t("common.cancel")}
          onConfirm={() => restoreDefaults()}
        />
        <ConfirmDialog
          triggerLabel={t("settings.privacy.deleteAccount")}
          title={t("settings.privacy.deleteAccount")}
          description={t("settings.privacy.deleteAccountConfirm")}
          confirmLabel={t("common.delete")}
          cancelLabel={t("common.cancel")}
          destructive
          onConfirm={() => deleteAccountMutation.mutate()}
        />
      </div>
    </SectionCard>
  );
}
