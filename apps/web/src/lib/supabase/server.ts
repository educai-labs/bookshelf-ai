import { createServerClient as createSupabaseServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

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
 * Crea un cliente Supabase para Server Components / Route Handlers.
 * Lee y escribe cookies de autenticación vía `cookies()` de `next/headers`;
 * los refrescos de sesión los gestiona `middleware.ts` (updateSession).
 */
export function createServerClient(): SupabaseClient {
  const cookieStore = cookies();

  return createSupabaseServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // `setAll` se llama desde un Server Component (solo lectura).
          // Ignorable si middleware refresca la sesión del usuario.
        }
      },
    },
  });
}
