import type { Metadata } from "next";

import { RegisterForm } from "./RegisterForm";

export const metadata: Metadata = {
  title: "Crear cuenta — Bookshelf",
};

/**
 * Página pública de registro (Server Component).
 * `RegisterForm` maneja el alta en cliente (email/password o Google).
 */
export default function RegisterPage() {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight">Bookshelf</h1>
        <p className="text-muted-foreground">Crea tu cuenta gratuita</p>
      </div>
      <RegisterForm />
    </div>
  );
}
