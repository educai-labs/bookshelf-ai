export { updateSession as middleware } from "./src/lib/supabase/middleware";

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};
