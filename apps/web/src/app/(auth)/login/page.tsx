import type { Metadata } from "next";

import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Iniciar sesión — Bookshelf",
};

/**
 * Página pública de login (Server Component).
 * El layout `(auth)` la centra; `LoginForm` maneja el submit en cliente.
 */
export default function LoginPage() {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight">Bookshelf</h1>
        <p className="text-muted-foreground">Bienvenido de nuevo</p>
      </div>
      <LoginForm />
    </div>
  );
}
