import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { matchesBookQuery } from "@/lib/books/search";
import { findMatchingIds } from "@/lib/books/seed";

interface Row {
  id: string;
  title: string;
  authors: string[];
}

const DATASET: Row[] = [
  { id: "b1", title: "Clean Code", authors: ["Robert C. Martin"] },
  { id: "b2", title: "Dune", authors: ["Frank Herbert"] },
  { id: "b3", title: "Refactoring", authors: ["Martin Fowler"] },
  { id: "b4", title: "The Hobbit", authors: ["J.R.R. Tolkien"] },
];

/**
 * Supabase mock que simula las dos queries de `findMatchingIds`:
 * 1) título vía `ilike("title", "%q%")` (Postgres, case-insensitive substring),
 * 2) autores via `select("id, authors")` (el filtro de autor es en JS).
 */
function makeSupabaseMock(q: string): SupabaseClient {
  const qLower = q.toLowerCase();
  const titleRows = DATASET.filter((b) =>
    b.title.toLowerCase().includes(qLower),
  ).map((b) => ({ id: b.id }));
  const authorRows = DATASET.map((b) => ({ id: b.id, authors: b.authors }));

  let callIndex = 0;
  const from = vi.fn(() => {
    callIndex += 1;
    const isTitleQuery = callIndex === 1;
    const data = isTitleQuery ? titleRows : authorRows;
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.ilike = vi.fn(() => chain);
    chain.then = (resolve: (v: unknown) => unknown) =>
      resolve({ data, error: null });
    return chain;
  });

  return { from } as unknown as SupabaseClient;
}

describe("paridad SSR/cliente del criterio de búsqueda (título y autor)", () => {
  for (const q of ["martin", "clean", "tolkien", "dune", "zzz"]) {
    it(`devuelve los mismos IDs para q="${q}"`, async () => {
      const supabase = makeSupabaseMock(q);
      const ssrIds = await findMatchingIds(supabase, "u1", q);

      // Criterio del cliente (mismo que el API): título O autor, substring.
      const clientIds = DATASET.filter((b) =>
        matchesBookQuery(b.title, b.authors, q),
      ).map((b) => b.id);

      expect([...ssrIds].sort()).toEqual([...clientIds].sort());
    });
  }

  it("incluye coincidencias por autor aunque el título no coincida", async () => {
    // "fowler" solo aparece en el autor de b3, no en ningún título.
    const supabase = makeSupabaseMock("fowler");
    const ssrIds = await findMatchingIds(supabase, "u1", "fowler");
    expect(ssrIds).toContain("b3");
    expect(ssrIds).not.toContain("b1");
  });
});
