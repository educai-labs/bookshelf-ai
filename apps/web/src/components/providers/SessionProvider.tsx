"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase/client";

type SessionContextValue = {
  /** Sesión actual de Supabase Auth (null si no autenticado). */
  session: Session | null;
  /** Usuario autenticado (null si no autenticado). */
  user: User | null;
  /** true mientras se resuelve la sesión inicial. */
  isLoading: boolean;
};

const SessionContext = createContext<SessionContextValue | undefined>(
  undefined,
);

/**
 * Wrapper fino sobre `createContext`/`useContext` para la sesión de usuario.
 * Expone `user`/`session` a los Client Components sin prop-drilling.
 *
 * La suscripción a `supabase.auth.getSession()` + `onAuthStateChange`
 * (que alimenta el contexto) la gestiona `useSession` en `hooks/useAuth.ts`.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted) {
        setSession(session);
        setIsLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        setSession(session);
        setIsLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const value: SessionContextValue = {
    session,
    user: session?.user ?? null,
    isLoading,
  };

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSessionContext(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (ctx === undefined) {
    throw new Error("useSessionContext must be used within a SessionProvider");
  }
  return ctx;
}
