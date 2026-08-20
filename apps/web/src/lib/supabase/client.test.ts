import { describe, expect, it } from "vitest";

import { createBrowserClient, supabase } from "./client";

describe("supabase browser client", () => {
  it("exports a supabase singleton instance", () => {
    expect(supabase).toBeDefined();
  });

  it("createBrowserClient is memoized (same instance on repeated calls)", () => {
    expect(createBrowserClient()).toBe(createBrowserClient());
  });

  it("the exported singleton is the memoized instance", () => {
    expect(supabase).toBe(createBrowserClient());
  });
});
