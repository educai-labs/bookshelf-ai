import { AlertCircle } from "lucide-react";
import type { Metadata } from "next";

import { RegisterForm } from "./RegisterForm";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const metadata: Metadata = {
  title: "Crear cuenta — Bookshelf",
};

/**
 * Página pública de registro (Server Component).
 * `RegisterForm` maneja el alta en cliente (email/password o Google).
 * Muestra un error legible si el callback OAuth falla (`?error=...`).
 */
export default function RegisterPage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  const error = searchParams?.error;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight">Bookshelf</h1>
        <p className="text-muted-foreground">Crea tu cuenta gratuita</p>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Error de autenticación</AlertTitle>
          <AlertDescription>
            No se pudo completar el registro. Inténtalo de nuevo o usa email y
            contraseña.
          </AlertDescription>
        </Alert>
      ) : null}
      <RegisterForm />
    </div>
  );
}
