// Mapa de rutas del App Router (feature 028).
//
// Fuente de verdad para las pruebas de navegación: ningún enlace del shell
// (Sidebar, DashboardHeader, boundaries de error) debe apuntar a una ruta que
// no esté definida aquí. Se mantiene manualmente junto a las carpetas reales
// de `src/app` y los route groups `(auth)`/`(dashboard)`.

/** Ruta de aterrizaje tras login/errores (fallback seguro). */
export const DEFAULT_REDIRECT = "/dashboard";

/** Rutas estáticas (sin parámetros) definidas en el App Router. */
export const STATIC_ROUTES: readonly string[] = [
  "/",
  "/login",
  "/register",
  "/auth/callback",
  "/dashboard",
  "/settings",
  "/chat",
];

/** Patrones de rutas dinámicas (con segmento `[param]`). */
export const DYNAMIC_ROUTES: readonly string[] = ["/book/[id]"];

/**
 * Comprueba si una ruta está definida en el App Router. Acepta una ruta
 * estática exacta o una instancia de un patrón dinámico (p. ej. `/book/abc`).
 */
export function isKnownRoute(pathname: string): boolean {
  if (STATIC_ROUTES.includes(pathname)) {
    return true;
  }
  return DYNAMIC_ROUTES.some((pattern) => {
    const regex = new RegExp(
      `^${pattern.replace(/\[[^\]]+\]/g, "[^/]+").replace(/\//g, "\\/")}$`,
    );
    return regex.test(pathname);
  });
}

/** Conjunto de rutas válidas para el test "ningún enlace del Sidebar apunta a 404". */
export const KNOWN_ROUTE_PATHS: readonly string[] = [
  ...STATIC_ROUTES,
  ...DYNAMIC_ROUTES,
];
