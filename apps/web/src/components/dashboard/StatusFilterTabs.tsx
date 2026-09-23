"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { BookStatus } from "@/types/book";
import { useTranslation } from "@/lib/i18n";

export type StatusFilterValue = BookStatus | "all";

export interface StatusFilterTabsProps {
  value: StatusFilterValue;
  onChange: (value: StatusFilterValue) => void;
}

/**
 * Tabs shadcn de filtro por status (feature 013):
 * "Todos" / "Quiero leer" / "Leyendo" / "Leídos" → filtra `status`.
 */
export function StatusFilterTabs({ value, onChange }: StatusFilterTabsProps) {
  const { t } = useTranslation();

  const TABS: Array<{ value: StatusFilterValue; label: string }> = [
    { value: "all", label: t("dashboard.status.all") },
    { value: "want_to_read", label: t("dashboard.status.wantToRead") },
    { value: "reading", label: t("dashboard.status.reading") },
    { value: "read", label: t("dashboard.status.read") },
  ];

  return (
    <Tabs
      value={value}
      onValueChange={(v) => onChange(v as StatusFilterValue)}
      aria-label={t("dashboard.filters.statusAria")}
    >
      <TabsList>
        {TABS.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
