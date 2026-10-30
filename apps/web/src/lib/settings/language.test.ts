import { describe, expect, it } from "vitest";

import {
  LANGUAGE_COOKIE_NAME,
  readLanguageCookie,
  resolveLanguage,
  setLanguageCookie,
} from "./language";

describe("language cookie (feature 028)", () => {
  it("normaliza valores a es/en con fallback es", () => {
    expect(resolveLanguage("en")).toBe("en");
    expect(resolveLanguage("es")).toBe("es");
    expect(resolveLanguage("fr")).toBe("es");
    expect(resolveLanguage(undefined)).toBe("es");
    expect(resolveLanguage(null)).toBe("es");
    expect(resolveLanguage("")).toBe("es");
  });

  it("lee la cookie de idioma de una cadena de cookies", () => {
    expect(readLanguageCookie(`${LANGUAGE_COOKIE_NAME}=en; theme=dark`)).toBe(
      "en",
    );
    expect(readLanguageCookie(`a=1; ${LANGUAGE_COOKIE_NAME}=es`)).toBe("es");
    expect(readLanguageCookie("theme=dark")).toBeNull();
    expect(readLanguageCookie(`${LANGUAGE_COOKIE_NAME}=fr`)).toBeNull();
    expect(readLanguageCookie("")).toBeNull();
  });

  it("ignora valores no válidos (fallback al layout)", () => {
    expect(readLanguageCookie(`${LANGUAGE_COOKIE_NAME}=`)).toBeNull();
    expect(readLanguageCookie(`${LANGUAGE_COOKIE_NAME}=EN`)).toBeNull();
  });

  it("escribe la cookie de idioma y puede leerse de vuelta", () => {
    document.cookie = `${LANGUAGE_COOKIE_NAME}=; path=/; max-age=0`;
    setLanguageCookie("en");
    expect(readLanguageCookie(document.cookie)).toBe("en");
  });
});
