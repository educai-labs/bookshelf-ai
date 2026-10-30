import { describe, expect, it } from "vitest";

import { en, es, type Dictionary } from "./dictionaries";
import { translate } from "./index";

/** Devuelve las rutas de las hojas (`"a.b.c"`) de un diccionario. */
function keysOf(dict: Dictionary): string[] {
  const out: string[] = [];
  const walk = (obj: Record<string, unknown>, prefix: string) => {
    for (const [key, value] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (typeof value === "string") {
        out.push(path);
      } else if (value && typeof value === "object") {
        walk(value as Record<string, unknown>, path);
      }
    }
  };
  walk(dict, "");
  return out.sort();
}

/** Devuelve las hojas (ruta → valor) de un diccionario. */
function leavesOf(dict: Dictionary): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (obj: Record<string, unknown>, prefix: string) => {
    for (const [key, value] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (typeof value === "string") {
        out[path] = value;
      } else if (value && typeof value === "object") {
        walk(value as Record<string, unknown>, path);
      }
    }
  };
  walk(dict, "");
  return out;
}

describe("dictionaries (claves huérfanas y cobertura)", () => {
  it("no tiene claves huérfanas: es y en comparten exactamente las mismas claves", () => {
    expect(keysOf(es)).toEqual(keysOf(en));
  });

  it("todas las hojas tienen texto no vacío en ambos idiomas", () => {
    for (const dict of [en, es]) {
      const leaves = leavesOf(dict);
      for (const [path, value] of Object.entries(leaves)) {
        expect(value.trim(), `${path} está vacío`).not.toBe("");
      }
    }
  });

  it("cubre las claves nuevas de error/not-found/menú/drawer en es y en", () => {
    const newKeys = [
      "error.title",
      "error.description",
      "error.retry",
      "error.reload",
      "error.notFoundTitle",
      "error.notFoundDescription",
      "error.backToDashboard",
      "sidebar.navAria",
      "sidebar.openMenu",
      "sidebar.closeMenu",
      "sidebar.navTitle",
      "sidebar.navDescription",
    ];
    for (const key of newKeys) {
      // `translate` devuelve la propia clave como fallback si no existe.
      expect(translate("es", key)).not.toBe(key);
      expect(translate("en", key)).not.toBe(key);
    }
  });
});
