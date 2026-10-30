import { NextResponse, type NextRequest } from "next/server";

import { safeRedirectTo } from "@/lib/auth/redirect";
import { createServerClient } from "@/lib/supabase/server";

/**
 * Callback de OAuth / magic link (Route Handler GET).
 * Recibe `code` (y opcional `next`) y lo canjea por una sesión server-side
 * via `exchangeCodeForSession`, redirigiendo a `next` (validado como ruta
 * interna relativa; default `/dashboard`).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // El destino post-login se valida de nuevo aquí (defensa en profundidad):
  // cualquier valor externo o malformado cae a `/dashboard`.
  const next = safeRedirectTo(searchParams.get("next"));

  if (code) {
    const supabase = createServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
