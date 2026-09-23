import { describe, expect, it } from "vitest";

import { es, en, type Dictionary } from "./dictionaries";
import { translate } from "./index";

describe("i18n", () => {
  it("traduce claves anidadas en es y en", () => {
    expect(translate("es", "auth.login.title")).toBe("Iniciar sesión");
    expect(translate("en", "auth.login.title")).toBe("Sign in");
  });

  it("sustituye parámetros {name}", () => {
    expect(translate("es", "rating.aria", { count: 4, max: 5 })).toBe(
      "Rating: 4 de 5",
    );
    expect(translate("en", "book.coverAlt", { title: "Dune" })).toBe(
      "Cover of Dune",
    );
  });

  it("devuelve la clave como fallback si no existe o el idioma no está soportado", () => {
    expect(translate("es", "no.existe")).toBe("no.existe");
    expect(translate("fr", "auth.login.title")).toBe("Iniciar sesión");
  });

  it("los diccionarios es/en tienen exactamente las mismas claves", () => {
    const keysOf = (dict: Dictionary): string[] => {
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
    };

    expect(keysOf(es)).toEqual(keysOf(en));
  });
});
