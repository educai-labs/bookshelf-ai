"use client";

import { useState } from "react";
import { Loader2, Search } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

import { useIsbnInput } from "@/hooks/useIsbnInput";
import { useAddBook } from "@/hooks/useAddBook";
import { lookupBook } from "@/lib/api/books";
import { BookMetadataPreview } from "@/components/book/BookMetadataPreview";
import { useSession } from "@/hooks/useAuth";
import type { BookLookupResponse } from "@/types/book";

interface AddBookModalProps {
  children: React.ReactElement;
}

type Stage = "input" | "preview" | "saving";

/**
 * Modal "Añadir libro por ISBN" (feature 014).
 *
 * Flujo:
 * 1. Stage "input": input ISBN con normalización/validación, botón "Buscar".
 * 2. Click "Buscar" → GET /api/v1/books/lookup?isbn=... → stage "preview" con datos.
 * 3. Stage "preview": BookMetadataPreview + botón "Guardar libro".
 * 4. Click "Guardar" → POST /api/v1/books → success: cierra modal, toast, invalidación query.
 *
 * Accesibilidad: DialogTitle, DialogDescription, labels, aria-describedby, focus trap (radix).
 */
export function AddBookModal({ children }: AddBookModalProps) {
  const [stage, setStage] = useState<Stage>("input");
  const [lookupData, setLookupData] = useState<BookLookupResponse | null>(null);
  const [isLookupPending, setIsLookupPending] = useState(false);

  const { isbn, formattedIsbn, isValid, onChange, reset } = useIsbnInput();
  const { session, isLoading: isSessionLoading } = useSession();

  const {
    mutate: addBook,
    isPending: isAdding,
    reset: resetAddBook,
  } = useAddBook(
    {
      onClose: () => {
        setStage("input");
        setLookupData(null);
        reset();
        resetAddBook();
      },
    },
    session,
  );

  async function handleSearch() {
    if (!isValid || isSessionLoading) return;
    setIsLookupPending(true);
    try {
      const data = await lookupBook(isbn, session);
      setLookupData(data);
      setStage("preview");
    } catch (error) {
      if (error instanceof Error && "status" in error) {
        const apiError = error as unknown as {
          status: number;
          code: string;
          message: string;
        };
        const messages: Record<number, string> = {
          400: "ISBN inválido. Verifica el formato e inténtalo de nuevo.",
          404: "Libro no encontrado en Open Library ni Google Books.",
          409: "Este libro ya está en tu biblioteca.",
          500: "Error del servidor. Inténtalo más tarde.",
        };
        toast.error(
          messages[apiError.status] ??
            apiError.message ??
            "Error al buscar el libro",
        );
      } else {
        toast.error("Error al buscar el libro");
      }
    } finally {
      setIsLookupPending(false);
    }
  }

  function handleSave() {
    if (!lookupData) return;
    addBook(isbn);
    setStage("saving");
  }

  function handleBackToInput() {
    setStage("input");
    setLookupData(null);
  }

  function handleClose() {
    setStage("input");
    setLookupData(null);
    reset();
    resetAddBook();
  }

  return (
    <Dialog onOpenChange={(open) => !open && handleClose()}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle id="add-book-title">Añadir libro por ISBN</DialogTitle>
          <DialogDescription id="add-book-description">
            Introduce el ISBN-13 del libro para buscar sus metadatos y añadirlo
            a tu biblioteca.
          </DialogDescription>
        </DialogHeader>

        {stage === "input" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="isbn-input" className="text-sm font-medium">
                ISBN-13
              </Label>
              <Input
                id="isbn-input"
                type="text"
                value={formattedIsbn}
                onChange={(e) => onChange(e.target.value)}
                placeholder="978-0-000-00000-0"
                disabled={isLookupPending || isSessionLoading}
                aria-describedby="isbn-helper"
                autoComplete="off"
              />
              <p id="isbn-helper" className="text-xs text-muted-foreground">
                Formato: 978XXXXXXXXXX (13 dígitos). Se normaliza
                automáticamente.
              </p>
            </div>
            <Button
              type="button"
              onClick={handleSearch}
              disabled={!isValid || isLookupPending || isSessionLoading}
              className="w-full"
            >
              {isLookupPending ? (
                <>
                  <Loader2 className="animate-spin" />
                  Buscando...
                </>
              ) : isSessionLoading ? (
                <>
                  <Loader2 className="animate-spin" />
                  Cargando sesión...
                </>
              ) : (
                <>
                  <Search />
                  Buscar
                </>
              )}
            </Button>
          </div>
        )}

        {stage === "preview" && (
          <div className="space-y-4">
            <BookMetadataPreview data={lookupData} />
            <Button
              type="button"
              onClick={handleSave}
              disabled={isAdding}
              className="w-full"
            >
              {isAdding ? (
                <>
                  <Loader2 className="animate-spin" />
                  Guardando...
                </>
              ) : (
                "Guardar libro"
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={handleBackToInput}
              disabled={isAdding}
              className="w-full"
            >
              Volver
            </Button>
          </div>
        )}

        {stage === "saving" && (
          <div className="space-y-4 text-center">
            <Loader2 className="mx-auto size-8 animate-spin" />
            <p className="text-muted-foreground">
              Guardando libro en tu biblioteca...
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
