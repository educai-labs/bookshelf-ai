"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { createBook, type ApiError } from "@/lib/api/books";
import { addBookErrorKey } from "@/lib/api/errors";
import { useTranslation } from "@/lib/i18n";

export interface UseAddBookOptions {
  /** Se invoca tras un alta con éxito (201) para cerrar/resetear el modal. */
  onClose?: () => void;
  /** Se invoca tras un fallo del guardado (para que el modal recupere un estado operativo). */
  onError?: (error: ApiError) => void;
}

/**
 * Hook para la mutación de crear un libro (`POST /api/v1/books`).
 * Usa React Query `useMutation` para manejo de loading, error, y invalidación de cache.
 */
export function useAddBook(
  options?: UseAddBookOptions,
  session?: { access_token: string } | null,
) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const mutation = useMutation({
    mutationFn: (isbn13: string) =>
      createBook({ isbn13, status: "want_to_read" }, session),
    onSuccess: () => {
      // Invalida el prefijo de libros para refrescar el grid (alcanza a
      // useBooks, que se alimenta de una query con clave `["books", ...]`).
      queryClient.invalidateQueries({ queryKey: ["books"] });
      toast.success(t("addBook.saveSuccess"));
      options?.onClose?.();
    },
    onError: (error: ApiError) => {
      // Mensaje mapeado único (400/404/409/500 + fallback genérico).
      toast.error(t(addBookErrorKey(error.status)));
      options?.onError?.(error);
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
