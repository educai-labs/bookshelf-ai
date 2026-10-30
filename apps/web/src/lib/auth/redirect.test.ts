import { describe, expect, it } from "vitest";

import { safeRedirectTo, withRedirectTo } from "./redirect";

describe("safeRedirectTo", () => {
  it("permite rutas internas relativas (incluida query)", () => {
    expect(safeRedirectTo("/dashboard")).toBe("/dashboard");
    expect(safeRedirectTo("/book/abc-123?tab=notes")).toBe(
      "/book/abc-123?tab=notes",
    );
    expect(safeRedirectTo("/settings")).toBe("/settings");
  });

  it("cae a /dashboard para valores vacíos o ausentes", () => {
    expect(safeRedirectTo("")).toBe("/dashboard");
    expect(safeRedirectTo("   ")).toBe("/dashboard");
    expect(safeRedirectTo(null)).toBe("/dashboard");
    expect(safeRedirectTo(undefined)).toBe("/dashboard");
  });

  it("rechaza protocol-relative (//)", () => {
    expect(safeRedirectTo("//evil.example")).toBe("/dashboard");
    expect(safeRedirectTo("///evil.example")).toBe("/dashboard");
  });

  it("rechaza esquemas", () => {
    expect(safeRedirectTo("https://evil.example")).toBe("/dashboard");
    expect(safeRedirectTo("http://evil.example/path")).toBe("/dashboard");
    expect(safeRedirectTo("javascript:alert(1)")).toBe("/dashboard");
    expect(safeRedirectTo("data:text/html,<script>alert(1)</script>")).toBe(
      "/dashboard",
    );
  });

  it("rechaza hostnames y backslashes", () => {
    expect(safeRedirectTo("evil.example/path")).toBe("/dashboard");
    expect(safeRedirectTo("/\\evil.example")).toBe("/dashboard");
    expect(safeRedirectTo("\\evil.example")).toBe("/dashboard");
  });

  it("rechaza payloads malformados (caracteres de control)", () => {
    expect(safeRedirectTo("/dashboard\u0000evil")).toBe("/dashboard");
  });
});

describe("withRedirectTo", () => {
  it("añade redirectTo codificado solo si hay valor", () => {
    expect(withRedirectTo("/register", "/book/1?tab=notes")).toBe(
      "/register?redirectTo=%2Fbook%2F1%3Ftab%3Dnotes",
    );
    expect(withRedirectTo("/login", null)).toBe("/login");
    expect(withRedirectTo("/login", undefined)).toBe("/login");
    expect(withRedirectTo("/login", "")).toBe("/login");
  });
});
