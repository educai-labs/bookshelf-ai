import { redirect } from "next/navigation";

import { createServerClient } from "@/lib/supabase/server";

/**
 * Página raíz: redirige a `/dashboard` si hay sesión, a `/login` si no.
 * (`middleware.ts` también protege rutas; aquí se cubre la raíz).
 */
export default async function Page() {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  redirect(user ? "/dashboard" : "/login");
}
