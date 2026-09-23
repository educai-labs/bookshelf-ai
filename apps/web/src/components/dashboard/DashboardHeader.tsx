"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut, Loader2, Plus } from "lucide-react";
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
import { useAddBookModal } from "@/components/books/AddBookModalProvider";
import { useTranslation } from "@/lib/i18n";
import { useSettings } from "@/contexts/SettingsContext";

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
  const { t } = useTranslation();
  const { settings } = useSettings();
  const { openAddBook } = useAddBookModal();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      await supabase.auth.signOut();
      // Evento de cuenta (sección 3.5): solo si la notificación está activada.
      if (settings.notifications.account) {
        toast.success(t("header.signOutSuccess"));
      }
      router.push("/login");
    } catch {
      // Notificación de errores (sección 3.5): solo si está activada.
      if (settings.notifications.errors) {
        toast.error(t("header.signOutError"));
      }
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b bg-background px-6">
      <div className="flex items-center gap-2 font-semibold">Bookshelf</div>
      <div className="flex items-center gap-2">
        <Button size="sm" className="gap-2" onClick={() => openAddBook()}>
          <Plus className="size-4" />
          {t("header.addBook")}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2">
              <Avatar className="size-8">
                <AvatarFallback className="text-xs">
                  {initialsOf(user?.email)}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm">
                {user?.email ?? t("header.account")}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>
              {user?.email ?? t("header.account")}
            </DropdownMenuLabel>
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
              {t("header.signOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
