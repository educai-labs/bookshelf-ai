"use client";

// Hooks React Query de settings (feature 022).
//
// Complementan la fachada de estado `useSettings` (contexto): mientras el
// contexto centraliza el estado y la sincronización de preferencias de cuenta,
// estos hooks gestionan la carga de datos almacenados, la exportación, el
// borrado de cuenta y las acciones de sesión/historial con invalidación y
// feedback estructurado.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { deleteAccount, exportData, getStoredData } from "@/lib/api/settings";
import { supabase } from "@/lib/supabase/client";
import { useSettings } from "@/contexts/SettingsContext";
import { useTranslation } from "@/lib/i18n";

/** `GET /settings/data` — qué datos se almacenan del usuario. */
export function useStoredData(enabled = true) {
  return useQuery({
    queryKey: ["settings", "data"],
    queryFn: getStoredData,
    enabled,
    retry: 1,
  });
}

/** `GET /settings/export` — exporta libros y notas (mutación explícita). */
export function useExportData() {
  const { t } = useTranslation();
  return useMutation({
    mutationFn: exportData,
    onSuccess: () => toast.success(t("settings.privacy.exportSuccess")),
    onError: (error: Error) =>
      toast.error(`${t("settings.privacy.exportError")}: ${error.message}`),
  });
}

/** `DELETE /settings/account` — elimina la cuenta (server-side). */
export function useDeleteAccount() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: deleteAccount,
    onSuccess: async () => {
      toast.success(t("settings.privacy.deleteAccountSuccess"));
      await supabase.auth.signOut();
      queryClient.clear();
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

/** Cierra sesión y limpia el historial local si la preferencia lo indica. */
export function useSignOut() {
  const { clearChatHistory, settings } = useSettings();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: async () => {
      if (settings.chat.clearHistoryOnLogout) {
        clearChatHistory();
      }
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    },
    onSuccess: () => toast.success(t("header.signOutSuccess")),
    onError: () => toast.error(t("header.signOutError")),
  });
}

/** Elimina el historial local del chat (sessionStorage). */
export function useClearLocalHistory() {
  const { clearChatHistory } = useSettings();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: async () => clearChatHistory(),
    onSuccess: () => toast.success(t("settings.privacy.clearHistorySuccess")),
  });
}
