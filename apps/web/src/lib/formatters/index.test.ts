import { describe, expect, it } from "vitest";

import {
  formatDate,
  formatNumber,
  formatRelativeTime,
  pluralize,
} from "./index";

describe("formatters", () => {
  it("formatea fechas según el idioma", () => {
    const date = new Date(2026, 2, 14);
    expect(formatDate("es", date)).toContain("14");
    expect(formatDate("en", date)).toContain("14");
  });

  it("formatea números con separadores del idioma", () => {
    expect(formatNumber("en", 1234567)).toBe("1,234,567");
    expect(formatNumber("es", 1234567)).toBe("1.234.567");
  });

  it("pluraliza", () => {
    expect(pluralize("es", 1, "libro", "libros")).toBe("libro");
    expect(pluralize("es", 2, "libro", "libros")).toBe("libros");
  });

  it("devuelve tiempo relativo para fechas pasadas", () => {
    const past = new Date(Date.now() - 5 * 60 * 1000); // hace 5 min
    const result = formatRelativeTime("es", past);
    expect(result).toMatch(/min/);
  });

  it("devuelve cadena vacía para fechas inválidas", () => {
    expect(formatDate("es", "not-a-date")).toBe("");
    expect(formatRelativeTime("es", "not-a-date")).toBe("");
  });
});
