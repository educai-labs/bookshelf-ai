"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
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

interface ReadingControlsProps {
  book: Book;
}

const STATUS_OPTIONS: { value: BookStatus; label: string }[] = [
  { value: "want_to_read", label: "Por leer" },
  { value: "reading", label: "Leyendo" },
  { value: "read", label: "Leído" },
];

export function ReadingControls({ book }: ReadingControlsProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
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

  const mutation = useMutation({
    mutationFn: (data: Partial<Book>) => updateBook(book.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["book", book.id] });
      toast.success("Cambios guardados");
      router.refresh();
    },
    onError: (error: Error) => {
      // Revertir estado local en caso de error
      setLocalStatus(book.status);
      setLocalRating(book.rating);
      setLocalStartedAt(book.started_at);
      setLocalFinishedAt(book.finished_at);
      toast.error(`Error: ${error.message}`);
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
    const iso = date ? format(date, "yyyy-MM-dd") : null;
    setLocalStartedAt(iso);
    mutation.mutate({ started_at: iso });
    setStartedAtOpen(false);
  };

  const handleFinishedAtChange = (date: Date | undefined) => {
    const iso = date ? format(date, "yyyy-MM-dd") : null;
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
        <label className="mb-1 block text-sm font-medium">Estado</label>
        <Select
          value={localStatus}
          onValueChange={handleStatusChange}
          disabled={mutation.isPending}
        >
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="Selecciona estado" />
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
        <label className="mb-1 block text-sm font-medium">Valoración</label>
        <InteractiveRatingStars
          rating={localRating}
          onChange={handleRatingChange}
          disabled={mutation.isPending}
          ariaLabel="Valoración del libro"
        />
      </div>

      {/* Started At Date Picker */}
      {showStartedAt && (
        <div>
          <label className="mb-1 block text-sm font-medium">Fecha inicio</label>
          <Popover open={startedAtOpen} onOpenChange={setStartedAtOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-start text-left font-normal sm:w-[200px]"
                disabled={mutation.isPending}
              >
                {localStartedAt
                  ? format(new Date(localStartedAt), "dd/MM/yyyy")
                  : "Seleccionar fecha"}
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
          <label className="mb-1 block text-sm font-medium">Fecha fin</label>
          <Popover open={finishedAtOpen} onOpenChange={setFinishedAtOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-start text-left font-normal sm:w-[200px]"
                disabled={mutation.isPending}
              >
                {localFinishedAt
                  ? format(new Date(localFinishedAt), "dd/MM/yyyy")
                  : "Seleccionar fecha"}
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
          Guardando...
        </div>
      )}
    </div>
  );
}
