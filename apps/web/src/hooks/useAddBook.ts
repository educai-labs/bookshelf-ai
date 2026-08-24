"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { createBook, type ApiError } from "@/lib/api/books";

/**
 * Hook para la mutación de crear un libro (`POST /api/v1/books`).
 * Usa React Query `useMutation` para manejo de loading, error, y invalidación de cache.
 */
export function useAddBook(
  options?: { onClose?: () => void },
  session?: { access_token: string } | null,
) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (isbn13: string) =>
      createBook({ isbn13, status: "want_to_read" }, session),
    onSuccess: () => {
      // Invalida la query de libros para refrescar el grid
      queryClient.invalidateQueries({ queryKey: ["books"] });
      toast.success("Libro añadido a tu biblioteca");
      options?.onClose?.();
    },
    onError: (error: ApiError) => {
      const messages: Record<number, string> = {
        400: "ISBN inválido. Verifica el formato e inténtalo de nuevo.",
        404: "Libro no encontrado en Open Library ni Google Books.",
        409: "Este libro ya está en tu biblioteca.",
        500: "Error del servidor. Inténtalo más tarde.",
      };
      toast.error(
        messages[error.status] ?? error.message ?? "Error al añadir el libro",
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
