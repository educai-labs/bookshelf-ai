"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSession } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase/client";

/** Iniciales del email para el fallback del avatar ("ana.m@x.com" → "AM"). */
function initialsOf(email: string | null | undefined): string {
  if (!email) return "U";
  const parts = email.split("@")[0]?.split(/[._-]/) ?? [];
  const initials = parts
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
  return initials || "U";
}

/**
 * Header del área protegida: avatar + email del usuario con menú
 * desplegable (shadcn DropdownMenu) y botón "Cerrar sesión".
 * Lee la sesión del `SessionProvider` vía `useSession()`.
 */
export function DashboardHeader() {
  const router = useRouter();
  const { user } = useSession();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      await supabase.auth.signOut();
      toast.success("Sesión cerrada");
      router.push("/login");
    } catch {
      toast.error("Error al cerrar sesión");
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b bg-background px-6">
      <div className="flex items-center gap-2 font-semibold">Bookshelf</div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="gap-2">
            <Avatar className="size-8">
              <AvatarFallback className="text-xs">
                {initialsOf(user?.email)}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm">{user?.email ?? "Mi cuenta"}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{user?.email ?? "Mi cuenta"}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={handleSignOut}
            disabled={isSigningOut}
            className="cursor-pointer"
          >
            {isSigningOut ? (
              <Loader2 className="animate-spin" />
            ) : (
              <LogOut className="size-4" />
            )}
            Cerrar sesión
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
