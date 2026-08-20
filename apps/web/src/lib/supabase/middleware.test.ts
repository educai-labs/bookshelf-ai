// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { updateSession } from "./middleware";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url, _key, options) => ({
    auth: {
      getUser: async () => {
        // Simula el refresco de token que hace supabase-js real:
        // invoca `setAll` para fijar cookies de auth en la respuesta.
        options.cookies.setAll(
          [{ name: "sb-test-auth-token", value: "refreshed", options: {} }],
          { "cache-control": "no-store" },
        );
        return mocks.getUser();
      },
    },
  }),
}));

describe("updateSession (edge middleware)", () => {
  it("redirects to /login?redirectTo=<original> when unauthenticated", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const request = new NextRequest("http://localhost:3000/dashboard");
    const response = await updateSession(request);

    expect(response.status).toBe(307);
    const location = response.headers.get("location") ?? "";
    expect(location).toContain("/login");
    expect(location).toContain("redirectTo=%2Fdashboard");
  });

  it("preserves the full original path (incl. query) in redirectTo", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const request = new NextRequest(
      "http://localhost:3000/book/abc-123?tab=notes",
    );
    const response = await updateSession(request);

    const location = response.headers.get("location") ?? "";
    expect(location).toContain("redirectTo=%2Fbook%2Fabc-123%3Ftab%3Dnotes");
  });

  it("passes through with session and forwards refreshed auth cookies", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "a@b.com" } },
      error: null,
    });

    const request = new NextRequest("http://localhost:3000/dashboard");
    const response = await updateSession(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    // Cookie de auth refrescada + headers anti-cache propagados por setAll.
    expect(response.cookies.get("sb-test-auth-token")?.value).toBe("refreshed");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("passes through public paths even without session", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const request = new NextRequest("http://localhost:3000/login");
    const response = await updateSession(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
