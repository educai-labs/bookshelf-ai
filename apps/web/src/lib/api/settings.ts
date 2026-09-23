// Cliente API de preferencias de cuenta (feature 022).
//
// Endpoints autenticados bajo `/api/v1/settings/*` con validación Zod de las
// respuestas (convención `tech-stack.md`: Zod en frontend para respuestas API).

import { ApiError } from "@/lib/api/books";
import { supabase } from "@/lib/supabase/client";
import {
  accountPreferencesSchema,
  exportDataSchema,
  storedDataInfoSchema,
} from "@/lib/validations/settings";
import type {
  AccountPreferences,
  ExportData,
  StoredDataInfo,
} from "@/types/settings";

/** Headers comunes con el token de acceso de la sesión Supabase. */
async function authHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};
}

/** Lanza `ApiError` tipado si la respuesta no es OK. */
async function ensureOk(res: Response, fallbackCode: string): Promise<void> {
  if (res.ok) return;
  const errorData = (await res.json().catch(() => ({}))) as {
    code?: string;
    message?: string;
    field?: string;
  };
  throw new ApiError(
    res.status,
    errorData.code ?? fallbackCode,
    errorData.message ?? "Error del servidor",
  );
}

/**
 * `GET /api/v1/settings` — preferencias de cuenta del usuario.
 * Devuelve los defaults si aún no hay fila (el backend aplica upsert).
 */
export async function getAccountPreferences(): Promise<AccountPreferences> {
  const headers = await authHeaders();
  const res = await fetch("/api/v1/settings", { headers });
  await ensureOk(res, "SETTINGS_FETCH_FAILED");
  const parsed = accountPreferencesSchema.safeParse(await res.json());
  if (!parsed.success) {
    throw new ApiError(
      res.status,
      "INVALID_SETTINGS_RESPONSE",
      "Respuesta de settings inválida",
    );
  }
  return parsed.data;
}

/**
 * `PUT /api/v1/settings` — guarda las preferencias de cuenta (upsert).
 * El backend valida enums/rangos y devuelve la versión canónica.
 */
export async function updateAccountPreferences(
  preferences: AccountPreferences,
): Promise<AccountPreferences> {
  const headers = await authHeaders();
  const res = await fetch("/api/v1/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(preferences),
  });
  await ensureOk(res, "SETTINGS_SAVE_FAILED");
  const parsed = accountPreferencesSchema.safeParse(await res.json());
  if (!parsed.success) {
    throw new ApiError(
      res.status,
      "INVALID_SETTINGS_RESPONSE",
      "Respuesta de settings inválida",
    );
  }
  return parsed.data;
}

/**
 * `GET /api/v1/settings/data` — qué datos se almacenan del usuario.
 */
export async function getStoredData(): Promise<StoredDataInfo> {
  const headers = await authHeaders();
  const res = await fetch("/api/v1/settings/data", { headers });
  await ensureOk(res, "DATA_FETCH_FAILED");
  const parsed = storedDataInfoSchema.safeParse(await res.json());
  if (!parsed.success) {
    throw new ApiError(
      res.status,
      "INVALID_DATA_RESPONSE",
      "Respuesta de datos inválida",
    );
  }
  return parsed.data;
}

/**
 * `GET /api/v1/settings/export` — exporta libros y notas del usuario (JSON).
 */
export async function exportData(): Promise<ExportData> {
  const headers = await authHeaders();
  const res = await fetch("/api/v1/settings/export", { headers });
  await ensureOk(res, "EXPORT_FAILED");
  const parsed = exportDataSchema.safeParse(await res.json());
  if (!parsed.success) {
    throw new ApiError(
      res.status,
      "INVALID_EXPORT_RESPONSE",
      "Respuesta de exportación inválida",
    );
  }
  return parsed.data;
}

/**
 * `DELETE /api/v1/settings/account` — elimina la cuenta del usuario (server-side,
 * sin aceptar `user_id` del cliente; el backend usa el JWT verificado).
 */
export async function deleteAccount(): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch("/api/v1/settings/account", {
    method: "DELETE",
    headers,
  });
  await ensureOk(res, "ACCOUNT_DELETE_FAILED");
}
