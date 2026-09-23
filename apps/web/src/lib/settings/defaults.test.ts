import { describe, expect, it, vi } from "vitest";

import {
  createDefaultSettings,
  DEFAULT_SETTINGS,
  detectBrowserLanguage,
  normalizeSettings,
} from "./defaults";

function setNavigatorLanguage(lang: string) {
  Object.defineProperty(window.navigator, "language", {
    value: lang,
    configurable: true,
  });
}

describe("defaults", () => {
  it("expone los defaults fijados en el plan", () => {
    expect(DEFAULT_SETTINGS.theme).toBe("system");
    expect(DEFAULT_SETTINGS.reader.fontSize).toBe(16);
    expect(DEFAULT_SETTINGS.reader.lineWidth).toBe(720);
    expect(DEFAULT_SETTINGS.reader.lineHeight).toBe(1.6);
    expect(DEFAULT_SETTINGS.reader.font).toBe("system");
    expect(DEFAULT_SETTINGS.chat.initialMode).toBe("book");
    expect(DEFAULT_SETTINGS.notifications.errors).toBe(true);
    expect(DEFAULT_SETTINGS.privacy.useNotesForSearch).toBe(true);
  });

  it("detecta el idioma del navegador con fallback a es", () => {
    setNavigatorLanguage("en-US");
    expect(detectBrowserLanguage()).toBe("en");
    setNavigatorLanguage("es-ES");
    expect(detectBrowserLanguage()).toBe("es");
    setNavigatorLanguage("fr-FR");
    expect(detectBrowserLanguage()).toBe("es");
  });

  it("normaliza valores inválidos a defaults (sin estados parciales inválidos)", () => {
    const result = normalizeSettings({
      theme: "nope",
      language: "de",
      reader: { fontSize: 999, lineWidth: 1, lineHeight: 99, font: "comic" },
    });
    expect(result.theme).toBe("system");
    expect(result.language).toBe("es");
    expect(result.reader.fontSize).toBe(22); // clamp al máximo
    expect(result.reader.lineWidth).toBe(480); // clamp al mínimo
    expect(result.reader.lineHeight).toBe(2.0);
    expect(result.reader.font).toBe("system");
  });

  it("normaliza un objeto nulo/vacío a defaults completos", () => {
    const result = normalizeSettings(null);
    expect(result).toEqual(createDefaultSettings());
  });

  it("preserva valores válidos", () => {
    const result = normalizeSettings({
      language: "en",
      reader: { fontSize: 20, lineWidth: 800, lineHeight: 1.8, font: "serif" },
    });
    expect(result.language).toBe("en");
    expect(result.reader.fontSize).toBe(20);
    expect(result.reader.font).toBe("serif");
  });
});
