import type { Metadata } from "next";

import { RegisterForm } from "./RegisterForm";
import { AuthPageContent } from "../AuthPageContent";

export const metadata: Metadata = {
  title: "Crear cuenta — Bookshelf",
};

/**
 * Página pública de registro (Server Component).
 * `RegisterForm` maneja el alta en cliente (email/password o Google).
 * `AuthPageContent` traduce el header y muestra el error OAuth (`?error=...`).
 */
export default function RegisterPage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  return (
    <AuthPageContent mode="register" error={searchParams?.error}>
      <RegisterForm />
    </AuthPageContent>
  );
}
