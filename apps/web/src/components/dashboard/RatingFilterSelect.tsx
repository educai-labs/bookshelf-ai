"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslation } from "@/lib/i18n";

export type RatingFilterValue = number | "all";

export interface RatingFilterSelectProps {
  value: RatingFilterValue;
  onChange: (value: RatingFilterValue) => void;
}

/**
 * Select shadcn de filtro por rating (feature 013):
 * "Todas" / "★★★★★" ... "★" → filtra por rating (valor numérico 1-5).
 */
export function RatingFilterSelect({
  value,
  onChange,
}: RatingFilterSelectProps) {
  const { t } = useTranslation();

  const RATING_OPTIONS: Array<{ value: RatingFilterValue; label: string }> = [
    { value: "all", label: t("dashboard.filters.ratingAll") },
    { value: 5, label: "★★★★★" },
    { value: 4, label: "★★★★" },
    { value: 3, label: "★★★" },
    { value: 2, label: "★★" },
    { value: 1, label: "★" },
  ];

  return (
    <Select
      value={String(value)}
      onValueChange={(v) => onChange(v === "all" ? "all" : Number(v))}
    >
      <SelectTrigger
        aria-label={t("dashboard.filters.ratingAria")}
        className="w-40"
      >
        <SelectValue placeholder={t("dashboard.filters.rating")} />
      </SelectTrigger>
      <SelectContent>
        {RATING_OPTIONS.map((option) => (
          <SelectItem key={String(option.value)} value={String(option.value)}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
