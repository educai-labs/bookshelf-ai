"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, LayoutDashboard, Menu, Settings, X } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type NavItem = {
  id: string;
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
};

/**
 * Sidebar del layout protegido: navegación principal.
 *
 * Responsive (feature 028):
 * - En `sm` (≥640px) se mantiene el sidebar fijo actual (`w-56`).
 * - Por debajo de `sm` está colapsado por defecto y se abre como drawer con
 *   overlay (Radix Dialog), botón de menú accesible, cierre por Escape y por
 *   click en el overlay.
 * - El enlace activo se deriva del pathname y expone `aria-current="page"`.
 */
export function Sidebar() {
  const pathname = usePathname();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  // "Libros" apunta a `/dashboard` (la ruta de la vista principal): en 011 no
  // se creó una ruta `/books`, así que el enlace producía un 404 (Z5-01).
  const navItems: NavItem[] = [
    {
      id: "dashboard",
      label: t("sidebar.dashboard"),
      href: "/dashboard",
      icon: LayoutDashboard,
    },
    {
      id: "books",
      label: t("sidebar.books"),
      href: "/dashboard",
      icon: BookOpen,
    },
    {
      id: "settings",
      label: t("sidebar.settings"),
      href: "/settings",
      icon: Settings,
    },
  ];

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const renderNav = (onNavigate?: () => void) => (
    <nav className="flex flex-col gap-1">
      {navItems.map(({ id, label, href, icon: Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={id}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Escritorio (≥640px): sidebar fijo actual, sin regresión visual. */}
      <aside
        className="hidden w-56 shrink-0 border-r bg-muted/30 p-4 sm:block"
        aria-label={t("sidebar.navAria")}
      >
        {renderNav()}
      </aside>

      {/* Móvil (<640px): botón de menú + drawer con overlay. */}
      <div className="sm:hidden">
        <Button
          variant="ghost"
          size="icon"
          data-testid="sidebar-menu-button"
          aria-label={t("sidebar.openMenu")}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <Menu className="size-5" aria-hidden="true" />
        </Button>

        <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay
              data-testid="sidebar-overlay"
              onClick={() => setOpen(false)}
              className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/80"
            />
            <DialogPrimitive.Content
              data-testid="sidebar-drawer"
              className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left fixed inset-y-0 left-0 z-50 flex w-64 max-w-[80vw] flex-col gap-4 border-r bg-background p-4 shadow-lg duration-200"
            >
              <div className="flex items-center justify-between">
                <DialogPrimitive.Title className="text-lg font-semibold">
                  {t("sidebar.navTitle")}
                </DialogPrimitive.Title>
                <DialogPrimitive.Close asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("sidebar.closeMenu")}
                  >
                    <X className="size-4" aria-hidden="true" />
                  </Button>
                </DialogPrimitive.Close>
              </div>
              <DialogPrimitive.Description className="sr-only">
                {t("sidebar.navDescription")}
              </DialogPrimitive.Description>
              {renderNav(() => setOpen(false))}
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      </div>
    </>
  );
}
