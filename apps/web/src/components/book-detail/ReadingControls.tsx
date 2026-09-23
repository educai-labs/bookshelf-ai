"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Calendar, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Book, BookStatus } from "@/types/book";
import { updateBook } from "@/lib/api/books";
import { InteractiveRatingStars } from "./InteractiveRatingStars";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { toast } from "sonner";
import { useTranslation } from "@/lib/i18n";
import { useSettings } from "@/contexts/SettingsContext";
import { formatDate } from "@/lib/formatters";

interface ReadingControlsProps {
  book: Book;
}

export function ReadingControls({ book }: ReadingControlsProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t, language } = useTranslation();
  const { settings } = useSettings();
  const [localStatus, setLocalStatus] = useState<BookStatus>(book.status);
  const [localRating, setLocalRating] = useState<number | null>(book.rating);
  const [localStartedAt, setLocalStartedAt] = useState<string | null>(
    book.started_at,
  );
  const [localFinishedAt, setLocalFinishedAt] = useState<string | null>(
    book.finished_at,
  );
  const [startedAtOpen, setStartedAtOpen] = useState(false);
  const [finishedAtOpen, setFinishedAtOpen] = useState(false);

  const STATUS_OPTIONS: { value: BookStatus; label: string }[] = [
    { value: "want_to_read", label: t("book.status.wantToRead") },
    { value: "reading", label: t("book.status.reading") },
    { value: "read", label: t("book.status.read") },
  ];

  const mutation = useMutation({
    mutationFn: (data: Partial<Book>) => updateBook(book.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["book", book.id] });
      toast.success(t("reading.changesSaved"));
      router.refresh();
    },
    onError: (error: Error) => {
      // Revertir estado local en caso de error
      setLocalStatus(book.status);
      setLocalRating(book.rating);
      setLocalStartedAt(book.started_at);
      setLocalFinishedAt(book.finished_at);
      // Notificación de errores (sección 3.5): solo si está activada.
      if (settings.notifications.errors) {
        toast.error(`${t("reading.saveError")}: ${error.message}`);
      }
    },
  });

  const handleStatusChange = (value: BookStatus) => {
    setLocalStatus(value);
    mutation.mutate({ status: value });
  };

  const handleRatingChange = (rating: number | null) => {
    setLocalRating(rating);
    mutation.mutate({ rating });
  };

  const handleStartedAtChange = (date: Date | undefined) => {
    const iso = date ? formatIso(date) : null;
    setLocalStartedAt(iso);
    mutation.mutate({ started_at: iso });
    setStartedAtOpen(false);
  };

  const handleFinishedAtChange = (date: Date | undefined) => {
    const iso = date ? formatIso(date) : null;
    setLocalFinishedAt(iso);
    mutation.mutate({ finished_at: iso });
    setFinishedAtOpen(false);
  };

  const showStartedAt = localStatus === "reading" || localStatus === "read";
  const showFinishedAt = localStatus === "read";

  return (
    <div className="space-y-4">
      {/* Status Select */}
      <div>
        <label className="mb-1 block text-sm font-medium">
          {t("reading.status")}
        </label>
        <Select
          value={localStatus}
          onValueChange={handleStatusChange}
          disabled={mutation.isPending}
        >
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder={t("reading.selectStatus")} />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Rating Stars */}
      <div>
        <label className="mb-1 block text-sm font-medium">
          {t("reading.rating")}
        </label>
        <InteractiveRatingStars
          rating={localRating}
          onChange={handleRatingChange}
          disabled={mutation.isPending}
          ariaLabel={t("reading.ratingAria")}
        />
      </div>

      {/* Started At Date Picker */}
      {showStartedAt && (
        <div>
          <label className="mb-1 block text-sm font-medium">
            {t("reading.startDate")}
          </label>
          <Popover open={startedAtOpen} onOpenChange={setStartedAtOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-start text-left font-normal sm:w-[200px]"
                disabled={mutation.isPending}
              >
                {localStartedAt
                  ? formatDate(language, localStartedAt)
                  : t("reading.selectDate")}
                <ChevronDown className="ml-auto size-4 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarComponent
                mode="single"
                selected={localStartedAt ? new Date(localStartedAt) : undefined}
                onSelect={handleStartedAtChange}
                disabled={mutation.isPending}
              />
            </PopoverContent>
          </Popover>
        </div>
      )}

      {/* Finished At Date Picker */}
      {showFinishedAt && (
        <div>
          <label className="mb-1 block text-sm font-medium">
            {t("reading.finishDate")}
          </label>
          <Popover open={finishedAtOpen} onOpenChange={setFinishedAtOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-start text-left font-normal sm:w-[200px]"
                disabled={mutation.isPending}
              >
                {localFinishedAt
                  ? formatDate(language, localFinishedAt)
                  : t("reading.selectDate")}
                <ChevronDown className="ml-auto size-4 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarComponent
                mode="single"
                selected={
                  localFinishedAt ? new Date(localFinishedAt) : undefined
                }
                onSelect={handleFinishedAtChange}
                disabled={(date: Date) =>
                  mutation.isPending ||
                  (localStartedAt ? date < new Date(localStartedAt) : false)
                }
              />
            </PopoverContent>
          </Popover>
        </div>
      )}

      {mutation.isPending && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="animate-spin">⟳</span>
          {t("reading.saving")}
        </div>
      )}
    </div>
  );
}

/** Formatea una fecha a ISO `yyyy-MM-dd` para el payload de la API. */
function formatIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
