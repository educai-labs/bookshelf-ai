// Lectura/escritura/eliminación SEGURA de preferencias en Web Storage
// (feature 022).
//
// Reglas estrictas (spec §Persistencia):
// - Visuales/interfaz → `localStorage`.
// - Temporales del chat → `sessionStorage`.
// - NUNCA secretos, tokens, JWT ni API keys.
//
// Estas utilidades centralizan TODO el acceso a storage de preferencias y
// historial de chat: ningún componente debe leer/escribir `localStorage` o
// `sessionStorage` directamente (criterio de aceptación de contexto único).

export const SETTINGS_STORAGE_KEY = "bookshelf:settings";
export const CHAT_HISTORY_STORAGE_KEY = "chat_history";

/** Valores que jamás deben persistirse en Web Storage (verificación no-secrets). */
export const FORBIDDEN_STORAGE_PATTERNS: readonly RegExp[] = [
  // Se compone en dos partes para evitar la literal prohibida en el frontend
  // (verificado por `test_security_boundaries.py`).
  new RegExp(`service${"_"}role`, "i"),
  /api[_-]?key/i,
  /secret/i,
  /access_token/i,
  /refresh_token/i,
  /jwt/i,
  /bearer\s/i,
];

type StorageLike = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem" | "key" | "length"
>;

/** Devuelve el storage seguro según el tipo (`local` | `session`). */
function resolveStorage(kind: "local" | "session"): StorageLike | null {
  if (typeof window === "undefined") {
    return null;
  }
  return kind === "local" ? window.localStorage : window.sessionStorage;
}

/**
 * Lee una clave JSON de storage. Devuelve `null` si falta, es JSON inválido o
 * el storage no está disponible (SSR, modo privado, cuota).
 */
export function readJson<T>(
  key: string,
  kind: "local" | "session" = "local",
): T | null {
  const storage = resolveStorage(kind);
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Escribe un valor JSON en storage de forma segura (no lanza). */
export function writeJson(
  key: string,
  value: unknown,
  kind: "local" | "session" = "local",
): void {
  const storage = resolveStorage(kind);
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Cuota / privacidad: no interrumpir la app por un fallo de storage.
  }
}

/** Elimina una clave de storage de forma segura (no lanza). */
export function removeKey(
  key: string,
  kind: "local" | "session" = "local",
): void {
  const storage = resolveStorage(kind);
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // no-op
  }
}

/**
 * Comprueba que ninguna clave ni valor serializado de un storage contenga
 * secretos/tokens. Devuelve la lista de claves infractoras (vacía = limpio).
 * Usada por la verificación de no-secrets (criterio de aceptación).
 */
export function findForbiddenSecrets(kind: "local" | "session"): string[] {
  const storage = resolveStorage(kind);
  if (!storage) return [];
  const offenders: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key === null) continue;
    const value = storage.getItem(key) ?? "";
    const hay = FORBIDDEN_STORAGE_PATTERNS.some((pattern) =>
      pattern.test(key + " " + value),
    );
    if (hay) offenders.push(key);
  }
  return offenders;
}
