import { beforeEach, describe, expect, it, vi } from "vitest";

import Page from "./page";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => ({
    auth: { getUser: mocks.getUser },
  }),
}));

describe("Page (root redirect)", () => {
  beforeEach(() => {
    mocks.redirect.mockReset();
    mocks.getUser.mockReset();
  });

  it("redirects to /dashboard when authenticated", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "a@b.com" } },
      error: null,
    });

    await Page();

    expect(mocks.redirect).toHaveBeenCalledTimes(1);
    expect(mocks.redirect).toHaveBeenCalledWith("/dashboard");
  });

  it("redirects to /login when not authenticated", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    await Page();

    expect(mocks.redirect).toHaveBeenCalledTimes(1);
    expect(mocks.redirect).toHaveBeenCalledWith("/login");
  });
});
