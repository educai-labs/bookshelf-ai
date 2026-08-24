"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { BookStatus } from "@/types/book";

export type StatusFilterValue = BookStatus | "all";

export interface StatusFilterTabsProps {
  value: StatusFilterValue;
  onChange: (value: StatusFilterValue) => void;
}

const TABS: Array<{ value: StatusFilterValue; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "want_to_read", label: "Quiero leer" },
  { value: "reading", label: "Leyendo" },
  { value: "read", label: "Leídos" },
];

/**
 * Tabs shadcn de filtro por status (feature 013):
 * "Todos" / "Quiero leer" / "Leyendo" / "Leídos" → filtra `status`.
 */
export function StatusFilterTabs({ value, onChange }: StatusFilterTabsProps) {
  return (
    <Tabs
      value={value}
      onValueChange={(v) => onChange(v as StatusFilterValue)}
      aria-label="Filtrar por estado"
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
