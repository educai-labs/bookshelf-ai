import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

// Verificación "no-string-hardcoded" (criterio de aceptación 40/54): escanea
// los componentes en busca de strings visibles sin traducir. Se apoya en el AST
// de TypeScript (evita falsos positivos de genéricos `Partial<...>` o flechas
// `=>`): detecta nodos `JSXText` con letras, atributos `placeholder`/`aria-label`/
// `title`/`alt` con literal, y literales `toast.*("...")`. Si aparece un literal
// con letras fuera de la allowlist, el test falla (impide regresiones de i18n).

/** Literales permitidos (marca, símbolos, separadores y glifos no traducibles). */
const ALLOWLIST = new Set<string>([
  "Bookshelf",
  "Bookshelf.",
  "★★★★★",
  "★★★★",
  "★★★",
  "★★",
  "★",
  "—",
]);

/** Directorios excluidos (componentes shadcn/ui vendidos, con textos propios). */
const EXCLUDED_DIR = join(process.cwd(), "src", "components", "ui");

const ROOT = join(process.cwd(), "src");

/** Recorre el árbol de `src` y devuelve las rutas `.tsx` (excluye tests y ui). */
function collectTsxFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (full === EXCLUDED_DIR) continue;
      collectTsxFiles(full, acc);
    } else if (entry.endsWith(".tsx") && !entry.endsWith(".test.tsx")) {
      acc.push(full);
    }
  }
  return acc;
}

function hasLetters(value: string): boolean {
  return /[\p{L}]/u.test(value);
}

/** Devuelve el nombre del elemento JSX que contiene un atributo (`Image`, `input`…). */
function jsxElementTagName(attr: ts.JsxAttribute): string {
  const attrs = attr.parent;
  const opening = attrs.parent;
  if (ts.isJsxOpeningElement(opening) || ts.isJsxSelfClosingElement(opening)) {
    return opening.tagName.getText();
  }
  return "";
}

interface Offender {
  file: string;
  value: string;
}

function scanFile(file: string): Offender[] {
  const sourceText = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(
    file,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const offenders: Offender[] = [];
  const push = (value: string) => {
    const trimmed = value.trim();
    if (hasLetters(trimmed) && !ALLOWLIST.has(trimmed)) {
      offenders.push({ file, value: trimmed });
    }
  };

  function visit(node: ts.Node): void {
    if (ts.isJsxText(node)) {
      // Texto literal entre etiquetas (sin `{}`). Se descarta whitespace.
      push(node.getText(sf));
    } else if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(sf);
      // `placeholder` en `<Image>` (next/image) es un prop de carga, no texto
      // visible (`placeholder="blur"`), así que se omite.
      if (name === "placeholder" && jsxElementTagName(node) === "Image") {
        // skip
      } else if (
        ["placeholder", "aria-label", "title", "alt"].includes(name) &&
        node.initializer &&
        ts.isStringLiteral(node.initializer)
      ) {
        push(node.initializer.text);
      }
    } else if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.expression.getText(sf) === "toast"
    ) {
      const method = node.expression.name.text;
      if (["success", "error", "info", "message", "warning"].includes(method)) {
        const arg = node.arguments[0];
        if (arg && ts.isStringLiteral(arg)) {
          push(arg.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sf);
  return offenders;
}

describe("no-string-hardcoded (escaneo de componentes)", () => {
  it("no quedan strings visibles sin traducir en componentes y vistas", () => {
    const files = collectTsxFiles(ROOT);
    expect(files.length).toBeGreaterThan(0);

    const offenders = files.flatMap(scanFile);

    expect(offenders).toEqual([]);
  });
});
