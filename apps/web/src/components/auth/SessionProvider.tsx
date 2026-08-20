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
 * Provee `session`/`user` a todo el árbol de Client Components bajo
 * `(dashboard)`. Obtiene la sesión inicial via `supabase.auth.getSession()`
 * y se mantiene sincronizado suscribiéndose a `onAuthStateChange`.
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
