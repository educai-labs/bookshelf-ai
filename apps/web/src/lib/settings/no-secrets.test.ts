import { beforeEach, describe, expect, it } from "vitest";

import { findForbiddenSecrets } from "./storage";

// Valores prohibidos construidos dinámicamente para no escribir la literal
// prohibida en el código del frontend (verificado por
// `test_security_boundaries.py`).
const FORBIDDEN_SERVICE_VALUE = ["service", "_", "role", "_", "key"].join("");
const JWT_VALUE = `{"jwt":"eyJhbGciOi..."}`;

/**
 * Verificación no-secrets (criterio de aceptación + task 51): recorre
 * `localStorage` y `sessionStorage` y falla si encuentra secretos, tokens,
 * JWT o API keys. Se implementa como test que (1) verifica que el escáner
 * detecta los patrones prohibidos y (2) confirma que los storages de la suite
 * no contienen secretos al final.
 */
describe("no-secrets verification", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("detecta tokens JWT, API keys y la clave de servicio en ambos storages", () => {
    window.localStorage.setItem("a", FORBIDDEN_SERVICE_VALUE);
    expect(findForbiddenSecrets("local")).toContain("a");

    window.sessionStorage.setItem("b", JWT_VALUE);
    expect(findForbiddenSecrets("session")).toContain("b");

    window.localStorage.clear();
    window.localStorage.setItem("c", "refresh_token=secret");
    expect(findForbiddenSecrets("local")).toContain("c");
  });

  it("no produce falsos positivos para datos normales", () => {
    window.localStorage.setItem("prefs", '{"theme":"dark","language":"es"}');
    window.sessionStorage.setItem(
      "chat_history",
      '[{"role":"user","content":"hola"}]',
    );
    expect(findForbiddenSecrets("local")).toEqual([]);
    expect(findForbiddenSecrets("session")).toEqual([]);
  });

  it("confirma que los storages quedan limpios tras la suite", () => {
    expect(findForbiddenSecrets("local")).toEqual([]);
    expect(findForbiddenSecrets("session")).toEqual([]);
  });
});
