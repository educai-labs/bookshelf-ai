"use client";

import { useSessionContext } from "@/components/providers/SessionProvider";

/**
 * Acceso al usuario autenticado desde Client Components.
 * Fuente: contexto de `SessionProvider` (sin prop-drilling).
 */
export function useUser() {
  const { user } = useSessionContext();
  return user;
}

/**
 * Sesión actual + estado de carga.
 * El contexto se alimenta de `supabase.auth.getSession()` + listener
 * `onAuthStateChange` (gestionado en `SessionProvider`).
 */
export function useSession() {
  const { session, isLoading } = useSessionContext();
  return { session, isLoading };
}
