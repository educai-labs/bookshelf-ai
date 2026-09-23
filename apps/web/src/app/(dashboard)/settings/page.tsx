import type { Metadata } from "next";

import { SettingsPage } from "@/components/settings/SettingsPage";

export const metadata: Metadata = {
  title: "Configuración | Bookshelf",
};

/** Ruta `/settings` (feature 022) dentro del route group protegido `(dashboard)`. */
export default function SettingsRoute() {
  return <SettingsPage />;
}
