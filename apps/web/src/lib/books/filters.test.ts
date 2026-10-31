import { describe, expect, it } from "vitest";

import type { BookFilters } from "@/types/book";
import {
  DEFAULT_BOOK_FILTERS,
  parseFilters,
  serializeFilters,
} from "./filters";

function paramsFrom(entries: Array<[string, string]> = []): URLSearchParams {
  return new URLSearchParams(entries);
}

describe("parseFilters (feature 030 · Z1-06)", () => {
  it("vuelve a los defaults sin query params", () => {
    expect(parseFilters(paramsFrom())).toEqual(DEFAULT_BOOK_FILTERS);
  });

  it("parsea q, status y rating válidos", () => {
    expect(
      parseFilters(
        paramsFrom([
          ["q", "dune"],
          ["status", "reading"],
          ["rating", "4"],
        ]),
      ),
    ).toEqual({ q: "dune", status: "reading", rating_min: 4 });
  });

  it("recorta q y descarta q vacío", () => {
    expect(parseFilters(paramsFrom([["q", "  clean  "]]))).toEqual({
      q: "clean",
    });
    expect(parseFilters(paramsFrom([["q", "   "]]))).toEqual(
      DEFAULT_BOOK_FILTERS,
    );
  });

  it("descarta status inválidos", () => {
    expect(parseFilters(paramsFrom([["status", "bogus"]]))).toEqual(
      DEFAULT_BOOK_FILTERS,
    );
  });

  it("descarta rating inválidos (no numérico, fuera de rango, no entero)", () => {
    expect(parseFilters(paramsFrom([["rating", "x"]]))).toEqual(
      DEFAULT_BOOK_FILTERS,
    );
    expect(parseFilters(paramsFrom([["rating", "0"]]))).toEqual(
      DEFAULT_BOOK_FILTERS,
    );
    expect(parseFilters(paramsFrom([["rating", "6"]]))).toEqual(
      DEFAULT_BOOK_FILTERS,
    );
    expect(parseFilters(paramsFrom([["rating", "3.5"]]))).toEqual(
      DEFAULT_BOOK_FILTERS,
    );
  });

  it("ignora parámetros desconocidos", () => {
    expect(
      parseFilters(
        paramsFrom([
          ["q", "dune"],
          ["status", "read"],
          ["unknown", "x"],
          ["page", "2"],
        ]),
      ),
    ).toEqual({ q: "dune", status: "read" });
  });
});

describe("serializeFilters (feature 030 · Z1-06)", () => {
  it("omite los defaults", () => {
    expect(serializeFilters(DEFAULT_BOOK_FILTERS).toString()).toBe("");
  });

  it("serializa q, status y rating_min (rating_min → rating)", () => {
    expect(
      serializeFilters({
        q: "dune",
        status: "reading",
        rating_min: 4,
      }).toString(),
    ).toBe("q=dune&status=reading&rating=4");
  });

  it("descarta valores inválidos y vacíos", () => {
    const invalid = {
      q: "  ",
      status: "bogus",
      rating_min: 99,
    } as unknown as BookFilters;
    expect(serializeFilters(invalid).toString()).toBe("");
  });
});

describe("round-trip", () => {
  it("serialize(parse(x)) es idempotente para valores válidos", () => {
    const params = paramsFrom([
      ["q", "dune"],
      ["status", "read"],
      ["rating", "5"],
    ]);
    const filters = parseFilters(params);
    expect(serializeFilters(filters).toString()).toBe(
      "q=dune&status=read&rating=5",
    );
  });

  it("parse(serialize(filters)) conserva los valores", () => {
    const filters = { q: "clean", status: "reading" as const, rating_min: 3 };
    const reparsed = parseFilters(serializeFilters(filters));
    expect(reparsed).toEqual(filters);
  });
});
