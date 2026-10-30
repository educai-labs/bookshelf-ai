import { describe, expect, it } from "vitest";

import { matchesBookQuery } from "./search";

describe("matchesBookQuery (criterio título/autor del API)", () => {
  it("coincide por título, case-insensitive y substring", () => {
    expect(matchesBookQuery("Clean Code", ["Robert C. Martin"], "clean")).toBe(
      true,
    );
    expect(matchesBookQuery("Clean Code", ["Robert C. Martin"], "CODE")).toBe(
      true,
    );
  });

  it("coincide por autor (substring en cualquiera)", () => {
    expect(matchesBookQuery("Dune", ["Frank Herbert"], "herb")).toBe(true);
    expect(
      matchesBookQuery("X", ["Robert C. Martin", "Martin Fowler"], "martin"),
    ).toBe(true);
  });

  it("no coincide si ni título ni autores contienen el texto", () => {
    expect(matchesBookQuery("Dune", ["Frank Herbert"], "tolkien")).toBe(false);
    expect(matchesBookQuery("", [], "x")).toBe(false);
  });

  it("tolera títulos/autores nulos o vacíos", () => {
    expect(matchesBookQuery("", ["Frank Herbert"], "herb")).toBe(true);
    expect(matchesBookQuery("Dune", [], "dune")).toBe(true);
  });
});
