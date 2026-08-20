import { createBrowserClient as createSupabaseBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

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

let cached: SupabaseClient | null = null;

/**
 * Crea (y memoiza) el cliente Supabase para Client Components.
 * Singleton a nivel de módulo: evita múltiples instancias en re-renders
 * (múltiples suscripciones auth / cookies inconsistentes).
 */
export function createBrowserClient(): SupabaseClient {
  if (!cached) {
    cached = createSupabaseBrowserClient(supabaseUrl, supabaseAnonKey);
  }
  return cached;
}

/** Instancia singleton exportada para uso directo en Client Components. */
export const supabase: SupabaseClient = createBrowserClient();
