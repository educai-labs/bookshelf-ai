import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { SessionProvider } from "@/components/auth/SessionProvider";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { Footer } from "@/components/layout/Footer";
import { Sidebar } from "@/components/layout/Sidebar";
import { createServerClient } from "@/lib/supabase/server";

/**
 * Layout protegido del route group `(dashboard)`:
 * - Verifica la sesión en el servidor (redirige a `/login` si no hay usuario).
 * - `SessionProvider` (Client) provee session/user a todo el árbol.
 * - `DashboardHeader` (avatar + logout) + Sidebar + main + Footer.
 */
export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SessionProvider>
        <DashboardHeader />
        <div className="flex flex-1">
          <Sidebar />
          <main className="flex-1 p-6">{children}</main>
        </div>
        <Footer />
      </SessionProvider>
    </div>
  );
}
