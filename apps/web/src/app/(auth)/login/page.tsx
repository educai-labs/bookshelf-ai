import type { Metadata } from "next";

import { LoginForm } from "./LoginForm";
import { AuthPageContent } from "../AuthPageContent";

export const metadata: Metadata = {
  title: "Iniciar sesión — Bookshelf",
};

/**
 * Página pública de login (Server Component).
 * El layout `(auth)` la centra; `LoginForm` maneja el submit en cliente.
 * `AuthPageContent` traduce el header y muestra el error OAuth (`?error=...`).
 */
export default function LoginPage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  return (
    <AuthPageContent mode="login" error={searchParams?.error}>
      <LoginForm />
    </AuthPageContent>
  );
}
