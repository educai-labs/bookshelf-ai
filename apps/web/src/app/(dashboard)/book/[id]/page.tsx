import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { getBook, getBookNotes } from "@/lib/api/books";
import type { Book, PaginatedNotes } from "@/types/book";
import { BookDetailClient } from "./BookDetailClient";

/** Tamaño de página para la primera carga de notas (server-side). */
const NOTES_PAGE_SIZE = 50;

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function BookDetailPage({ params }: PageProps) {
  const { id: bookId } = await params;

  // Obtener usuario actual desde Supabase server client.
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    notFound();
  }

  // Obtener access token para llamar a la API backend.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    notFound();
  }

  // Fetch libro + primera página de notas mediante el cliente API compartido.
  // Un fallo de red / 404 deriva a `notFound()` (salida controlada, sin
  // `console.*` directo ni página rota).
  let book: Book;
  let initialNotes: PaginatedNotes;

  try {
    [book, initialNotes] = await Promise.all([
      getBook(bookId, session),
      getBookNotes(bookId, { page: 1, pageSize: NOTES_PAGE_SIZE, session }),
    ]);
  } catch {
    notFound();
  }

  // 404 si no existe o no pertenece al usuario.
  if (book.user_id !== user.id) {
    notFound();
  }

  return <BookDetailClient book={book} initialNotes={initialNotes} />;
}
