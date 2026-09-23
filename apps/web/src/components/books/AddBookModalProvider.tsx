"use client";

import { createContext, useCallback, useContext, useState } from "react";

import { AddBookModal } from "@/components/books/AddBookModal";

interface AddBookModalContextValue {
  /** Abre el modal "Añadir libro" (opcionalmente con un ISBN precargado). */
  openAddBook: (isbn13?: string) => void;
}

const AddBookModalContext = createContext<AddBookModalContextValue | null>(
  null,
);

/**
 * Acceso a la apertura controlada del modal "Añadir libro" (feature 023).
 *
 * Permite abrir el modal desde cualquier superficie del dashboard (botón del
 * header o sugerencia de catálogo del buscador) sin duplicar el componente:
 * `AddBookModalProvider` renderiza una única instancia en modo controlado.
 */
export function useAddBookModal(): AddBookModalContextValue {
  const context = useContext(AddBookModalContext);
  if (!context) {
    throw new Error(
      "useAddBookModal debe usarse dentro de AddBookModalProvider",
    );
  }
  return context;
}

export function AddBookModalProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [initialIsbn, setInitialIsbn] = useState<string | null>(null);

  const openAddBook = useCallback((isbn13?: string) => {
    setInitialIsbn(isbn13 ?? null);
    setOpen(true);
  }, []);

  return (
    <AddBookModalContext.Provider value={{ openAddBook }}>
      {children}
      <AddBookModal
        open={open}
        onOpenChange={setOpen}
        initialIsbn={initialIsbn}
      />
    </AddBookModalContext.Provider>
  );
}
