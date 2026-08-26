// Tests del helper de renderizado Markdown (feature 017).

import { describe, expect, it, vi } from "vitest";

vi.mock("dompurify", () => ({
  default: {
    sanitize: vi.fn((html: string) =>
      html.replace(/<script[\s\S]*?<\/script>/gi, ""),
    ),
  },
}));

import { renderMarkdownToHtml } from "./markdown";

describe("renderMarkdownToHtml", () => {
  it("convierte Markdown a HTML", () => {
    const html = renderMarkdownToHtml("**negrita** y *cursiva*");

    expect(html).toContain("<strong>negrita</strong>");
    expect(html).toContain("<em>cursiva</em>");
  });

  it("sanitiza scripts antes de devolver el HTML", () => {
    const html = renderMarkdownToHtml(
      "<script>alert('xss')</script> texto seguro",
    );

    expect(html).not.toContain("<script>");
    expect(html).toContain("texto seguro");
  });
});
