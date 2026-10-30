// Tests de sanitización (feature 029 · Z4-07): fuerza `rel="noopener noreferrer"`
// en enlaces con `target="_blank"` y conserva las protecciones XSS existentes.

import { describe, expect, it } from "vitest";

import { sanitizeHtml } from "./sanitize";

describe("sanitizeHtml", () => {
  it("fuerza rel=noopener noreferrer en enlaces con target=_blank", () => {
    const html = sanitizeHtml(
      '<a href="https://ejemplo.com" target="_blank">enlace</a>',
    );

    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("no añade rel a enlaces sin target=_blank", () => {
    const html = sanitizeHtml('<a href="https://ejemplo.com">enlace</a>');

    expect(html).not.toContain("noopener noreferrer");
  });

  it("conserva las protecciones XSS existentes (elimina script)", () => {
    const html = sanitizeHtml("<script>alert(1)</script><p>seguro</p>");

    expect(html).not.toContain("<script>");
    expect(html).toContain("<p>seguro</p>");
  });

  it("conserva las protecciones XSS existentes (elimina atributos de eventos)", () => {
    const html = sanitizeHtml('<p onclick="alert(1)">texto</p>');

    expect(html).not.toContain("onclick");
    expect(html).toContain("texto");
  });
});
