"use client";

import { ChevronsUpDown } from "lucide-react";
import type { User } from "@supabase/supabase-js";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

function initialsOf(user: User): string {
  const email = user.email ?? "";
  const parts = email.split("@")[0]?.split(/[._-]/) ?? [];
  const initials = parts
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
  return initials || "U";
}

/**
 * Header del layout protegido: avatar + menú de usuario (placeholder).
 * El menú desplegable real (perfil/logout) se implementa en la feature 012.
 */
export function Header({ user }: { user: User }) {
  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b bg-background px-6">
      <div className="flex items-center gap-2 font-semibold">Bookshelf</div>
      <Button variant="ghost" className="gap-2">
        <Avatar className="size-8">
          <AvatarFallback className="text-xs">
            {initialsOf(user)}
          </AvatarFallback>
        </Avatar>
        <span className="text-sm">{user.email}</span>
        <ChevronsUpDown className="size-4 opacity-50" />
      </Button>
    </header>
  );
}
