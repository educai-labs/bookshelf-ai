export { updateSession as middleware } from "@/lib/supabase/middleware";

export const config = {
  matcher: ["/dashboard/:path*", "/book/:path*"],
};
