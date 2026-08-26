import { AlertCircle } from "lucide-react";
import type { Metadata } from "next";

import { LoginForm } from "./LoginForm";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const metadata: Metadata = {
  title: "Iniciar sesión — Bookshelf",
};

/**
 * Página pública de login (Server Component).
 * El layout `(auth)` la centra; `LoginForm` maneja el submit en cliente.
 * Muestra un error legible si el callback OAuth falla (`?error=...`).
 */
export default function LoginPage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  const error = searchParams?.error;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight">Bookshelf</h1>
        <p className="text-muted-foreground">Bienvenido de nuevo</p>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Error de autenticación</AlertTitle>
          <AlertDescription>
            No se pudo completar el inicio de sesión. Inténtalo de nuevo o usa
            email y contraseña.
          </AlertDescription>
        </Alert>
      ) : null}
      <LoginForm />
    </div>
  );
}
