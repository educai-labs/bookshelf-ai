import { describe, expect, it } from "vitest";

import { addBookErrorKey } from "./errors";

describe("addBookErrorKey", () => {
  it("mapea 400 → errorInvalid", () => {
    expect(addBookErrorKey(400)).toBe("addBook.errorInvalid");
  });

  it("mapea 404 → errorNotFound", () => {
    expect(addBookErrorKey(404)).toBe("addBook.errorNotFound");
  });

  it("mapea 409 → errorDuplicate", () => {
    expect(addBookErrorKey(409)).toBe("addBook.errorDuplicate");
  });

  it("mapea 500 → errorServer", () => {
    expect(addBookErrorKey(500)).toBe("addBook.errorServer");
  });

  it("usa el fallback genérico para estados no mapeados", () => {
    expect(addBookErrorKey(418)).toBe("addBook.errorGeneric");
    expect(addBookErrorKey(0)).toBe("addBook.errorGeneric");
    expect(addBookErrorKey(422)).toBe("addBook.errorGeneric");
  });

  it("usa el fallback genérico cuando no hay estado", () => {
    expect(addBookErrorKey(undefined)).toBe("addBook.errorGeneric");
  });
});
