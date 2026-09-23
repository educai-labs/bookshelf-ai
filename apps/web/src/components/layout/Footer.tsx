"use client";

import { useTranslation } from "@/lib/i18n";

/**
 * Footer del layout protegido (copyright).
 */
export function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="border-t py-4 text-center text-xs text-muted-foreground">
      © {new Date().getFullYear()} Bookshelf. {t("footer.rights")}
    </footer>
  );
}
