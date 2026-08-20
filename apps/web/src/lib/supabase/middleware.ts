import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function requireEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing Supabase env var: ${name}`);
  }
  return value;
}

// Acceso ESTÁTICO a las NEXT_PUBLIC_* para que Next.js las inlinee en build
// (también funciona en runtime dev/standalone sin variables de entorno).
const supabaseUrl = requireEnv(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  "NEXT_PUBLIC_SUPABASE_URL",
);
const supabaseAnonKey = requireEnv(
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
);

/**
 * Refresca la sesión del usuario en cada request (edge middleware).
 * - `createServerClient` lee/escribe las cookies de auth del request.
 * - `supabase.auth.getUser()` valida el token; si no hay usuario y la ruta
 *   es protegida → redirect a `/login?redirectTo=<url original>`.
 *
 * IMPORTANTE: no ejecutar lógica entre `createServerClient` y `getUser()`
 * (puede romper la sesión). Devolver siempre `supabaseResponse`.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
        // Respuestas que fijan cookies de auth no deben cachearse por CDNs.
        Object.entries(headers).forEach(([key, value]) =>
          supabaseResponse.headers.set(key, value),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;

  const isPublicPath =
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/auth/callback");

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Preserva la URL original para redirigir tras autenticarse.
    url.searchParams.set("redirectTo", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
