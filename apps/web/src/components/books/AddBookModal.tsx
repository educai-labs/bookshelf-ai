"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

import { BookSearchCombobox } from "@/components/search/BookSearchCombobox";
import { useAddBook } from "@/hooks/useAddBook";
import { lookupBook } from "@/lib/api/books";
import { BookMetadataPreview } from "@/components/book/BookMetadataPreview";
import { useSession } from "@/hooks/useAuth";
import { useTranslation } from "@/lib/i18n";
import { normalizeIsbn13 } from "@/lib/isbn";
import type { BookLookupResponse, BookSuggestion } from "@/types/book";

interface AddBookModalProps {
  /** Trigger (modo no controlado, feature 014). */
  children?: React.ReactElement;
  /** Modo controlado: apertura externa (dashboard → sugerencia de catálogo). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** ISBN inicial (se ejecuta el lookup al abrir). */
  initialIsbn?: string | null;
}

type Stage = "input" | "preview" | "saving";

/**
 * Modal "Añadir libro" (features 014 + 023).
 *
 * - **Input combinado**: acepta texto libre (título, autor o ISBN) con
 *   sugerencias en vivo (`BookSearchCombobox`). Seleccionar una sugerencia de
 *   catálogo carga la preview (lookup por ISBN); una de biblioteca marca
 *   "Ya en tu biblioteca".
 * - **ISBN manual**: escribir un ISBN-13 completo mantiene el flujo 014
 *   (detección, normalización, lookup y errores 400/404/409/500 con toasts).
 * - **Modo controlado** (`open`/`onOpenChange`/`initialIsbn`) para abrirlo
 *   desde el dashboard sin romper el `DialogTrigger` de 014.
 */
export function AddBookModal({
  children,
  open,
  onOpenChange,
  initialIsbn,
}: AddBookModalProps) {
  const { t } = useTranslation();
  const [stage, setStage] = useState<Stage>("input");
  const [lookupData, setLookupData] = useState<BookLookupResponse | null>(null);
  const [lookupIsbn, setLookupIsbn] = useState<string | null>(null);
  const [isLookupPending, setIsLookupPending] = useState(false);
  const [query, setQuery] = useState("");
  const [inLibraryMatch, setInLibraryMatch] = useState<BookSuggestion | null>(
    null,
  );
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const { session, isLoading: isSessionLoading } = useSession();

  const {
    mutate: addBook,
    isPending: isAdding,
    reset: resetAddBook,
  } = useAddBook(
    {
      onClose: () => resetModal(),
    },
    session,
  );

  const detectedIsbn = useMemo(() => normalizeIsbn13(query), [query]);

  function resetModal() {
    setStage("input");
    setLookupData(null);
    setLookupIsbn(null);
    setQuery("");
    setInLibraryMatch(null);
    setDropdownOpen(false);
    resetAddBook();
  }

  async function runLookup(isbn: string) {
    if (isSessionLoading) return;
    setIsLookupPending(true);
    setInLibraryMatch(null);
    try {
      const data = await lookupBook(isbn, session);
      setLookupData(data);
      setLookupIsbn(isbn);
      setStage("preview");
    } catch (error) {
      if (error instanceof Error && "status" in error) {
        const apiError = error as unknown as {
          status: number;
          code: string;
          message: string;
        };
        const messages: Record<number, string> = {
          400: t("addBook.errorInvalid"),
          404: t("addBook.errorNotFound"),
          409: t("addBook.errorDuplicate"),
          500: t("addBook.errorServer"),
        };
        toast.error(
          messages[apiError.status] ??
            apiError.message ??
            t("addBook.errorGeneric"),
        );
      } else {
        toast.error(t("addBook.errorGeneric"));
      }
    } finally {
      setIsLookupPending(false);
    }
  }

  // Apertura controlada con ISBN inicial → lookup directo a preview.
  useEffect(() => {
    if (open && initialIsbn) {
      setQuery(initialIsbn);
      void runLookup(initialIsbn);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialIsbn]);

  function handleSelectSuggestion(item: BookSuggestion) {
    if (item.source === "library") {
      setInLibraryMatch(item);
      return;
    }
    void runLookup(item.isbn13);
  }

  function handleSearch() {
    if (!detectedIsbn) return;
    void runLookup(detectedIsbn);
  }

  function handleSave() {
    if (!lookupIsbn) return;
    addBook(lookupIsbn);
    setStage("saving");
  }

  function handleBackToInput() {
    setStage("input");
    setLookupData(null);
    setLookupIsbn(null);
    setInLibraryMatch(null);
  }

  function handleClose() {
    resetModal();
  }

  const isControlled = open !== undefined;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) handleClose();
        onOpenChange?.(nextOpen);
      }}
    >
      {!isControlled && children ? (
        <DialogTrigger asChild>{children}</DialogTrigger>
      ) : null}
      <DialogContent
        className="max-w-md"
        onEscapeKeyDown={(event) => {
          // Con el dropdown abierto, Escape cierra SOLO el dropdown; el
          // Dialog de Radix despide en fase de captura, así que hay que
          // prevenir aquí (antes del handler del combobox) para no cerrar
          // el modal entero.
          if (dropdownOpen) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle id="add-book-title">{t("addBook.title")}</DialogTitle>
          <DialogDescription id="add-book-description">
            {t("addBook.description")}
          </DialogDescription>
        </DialogHeader>

        {stage === "input" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="add-book-search" className="text-sm font-medium">
                {t("addBook.isbn")}
              </Label>
              <BookSearchCombobox
                inputId="add-book-search"
                value={query}
                onValueChange={setQuery}
                onSelect={handleSelectSuggestion}
                onDropdownOpenChange={setDropdownOpen}
                placeholder={t("addBook.combinedPlaceholder")}
                ariaLabel={t("addBook.combinedPlaceholder")}
              />
              <p className="text-xs text-muted-foreground">
                {t("addBook.combinedHelper")}
              </p>
              {inLibraryMatch && (
                <p
                  className="text-xs font-medium text-amber-600"
                  data-testid="already-in-library"
                >
                  {t("addBook.alreadyInLibrary")}
                </p>
              )}
            </div>
            <Button
              type="button"
              onClick={handleSearch}
              disabled={!detectedIsbn || isLookupPending || isSessionLoading}
              className="w-full"
            >
              {isLookupPending ? (
                <>
                  <Loader2 className="animate-spin" />
                  {t("addBook.searching")}
                </>
              ) : isSessionLoading ? (
                <>
                  <Loader2 className="animate-spin" />
                  {t("addBook.loadingSession")}
                </>
              ) : (
                <>
                  <Search />
                  {t("addBook.search")}
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
                  {t("addBook.saving")}
                </>
              ) : (
                t("addBook.saveBook")
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={handleBackToInput}
              disabled={isAdding}
              className="w-full"
            >
              {t("common.back")}
            </Button>
          </div>
        )}

        {stage === "saving" && (
          <div className="space-y-4 text-center">
            <Loader2 className="mx-auto size-8 animate-spin" />
            <p className="text-muted-foreground">{t("addBook.savingBook")}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
