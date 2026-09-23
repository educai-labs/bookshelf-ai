import { beforeEach, describe, expect, it } from "vitest";

import {
  findForbiddenSecrets,
  readJson,
  removeKey,
  writeJson,
} from "./storage";

describe("storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("lee y escribe JSON de forma segura", () => {
    writeJson("k", { a: 1 }, "local");
    expect(readJson("k", "local")).toEqual({ a: 1 });
  });

  it("devuelve null ante JSON inválido", () => {
    window.localStorage.setItem("k", "no-es-json");
    expect(readJson("k", "local")).toBeNull();
  });

  it("elimina claves", () => {
    writeJson("k", 1, "session");
    removeKey("k", "session");
    expect(window.sessionStorage.getItem("k")).toBeNull();
  });

  it("detecta secretos/tokens en storage", () => {
    window.localStorage.setItem("ok", "valor normal");
    expect(findForbiddenSecrets("local")).toEqual([]);

    window.sessionStorage.setItem("leak", '{"access_token":"abc"}');
    expect(findForbiddenSecrets("session")).toContain("leak");

    window.localStorage.setItem("k2", "api-key=xyz");
    expect(findForbiddenSecrets("local")).toContain("k2");
  });
});
