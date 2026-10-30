import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const BOOK_DETAIL_DIR = join(process.cwd(), "src", "components", "book-detail");

/** Archivos fuente de book-detail (excluye tests y el directorio __tests__). */
function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__") continue;
      collectSourceFiles(full, acc);
    } else if (
      (entry.endsWith(".ts") || entry.endsWith(".tsx")) &&
      !entry.endsWith(".test.ts") &&
      !entry.endsWith(".test.tsx")
    ) {
      acc.push(full);
    }
  }
  return acc;
}

describe("book-detail no importa desde components/settings (Z5-08)", () => {
  it("no hay imports de components/settings en book-detail", () => {
    const files = collectSourceFiles(BOOK_DETAIL_DIR);
    expect(files.length).toBeGreaterThan(0);

    const offenders = files.filter((file) => {
      const source = readFileSync(file, "utf8");
      return (
        /components\/settings/.test(source) ||
        /from\s+["']\.\.\/settings/.test(source)
      );
    });

    expect(offenders).toEqual([]);
  });
});
