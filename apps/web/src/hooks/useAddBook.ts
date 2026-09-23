"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { createBook, type ApiError } from "@/lib/api/books";
import { useTranslation } from "@/lib/i18n";

/**
 * Hook para la mutación de crear un libro (`POST /api/v1/books`).
 * Usa React Query `useMutation` para manejo de loading, error, y invalidación de cache.
 */
export function useAddBook(
  options?: { onClose?: () => void },
  session?: { access_token: string } | null,
) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const mutation = useMutation({
    mutationFn: (isbn13: string) =>
      createBook({ isbn13, status: "want_to_read" }, session),
    onSuccess: () => {
      // Invalida la query de libros para refrescar el grid
      queryClient.invalidateQueries({ queryKey: ["books"] });
      toast.success(t("addBook.saveBook"));
      options?.onClose?.();
    },
    onError: (error: ApiError) => {
      const messages: Record<number, string> = {
        400: t("addBook.errorInvalid"),
        404: t("addBook.errorNotFound"),
        409: t("addBook.errorDuplicate"),
        500: t("addBook.errorServer"),
      };
      toast.error(
        messages[error.status] ?? error.message ?? t("addBook.errorGeneric"),
      );
    },
  });

  return {
    mutate: mutation.mutate,
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
    isSuccess: mutation.isSuccess,
    reset: mutation.reset,
  };
}
