import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { BookDetailClient } from "./BookDetailClient";

// URL absoluta del backend: en el servidor los rewrites de next.config.mjs no
// aplican a fetch saliente, así que se usa API_URL (o localhost:8000 en dev).
const API_URL = process.env.API_URL || "http://localhost:8000";

interface PageProps {
  params: Promise<{ id: string }>;
}

interface BookResponse {
  id: string;
  user_id: string;
  isbn13: string;
  title: string;
  authors: string[];
  cover_url: string | null;
  page_count: number | null;
  publisher: string | null;
  published_date: string | null;
  description: string | null;
  status: "want_to_read" | "reading" | "read";
  rating: number | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
  notes_count: number;
}

interface NotesResponse {
  items: Array<{
    id: string;
    book_id: string;
    content: string;
    content_html: string;
    chunk_index: number;
    created_at: string;
  }>;
  total: number;
  page: number;
  page_size: number;
}

/** Fetch libro desde la API backend (proxied via Next.js rewrites). */
async function fetchBook(
  accessToken: string,
  bookId: string,
): Promise<BookResponse | null> {
  const res = await fetch(`${API_URL}/api/v1/books/${bookId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    // No cache para datos de usuario
    cache: "no-store",
  });

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    console.error(`Error fetching book ${bookId}:`, await res.text());
    return null;
  }

  return res.json();
}

/** Fetch notas desde la API backend. */
async function fetchNotes(
  accessToken: string,
  bookId: string,
): Promise<NotesResponse["items"]> {
  const res = await fetch(
    `${API_URL}/api/v1/books/${bookId}/notes?page=1&page_size=50`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    },
  );

  if (!res.ok) {
    console.error(`Error fetching notes for book ${bookId}:`, await res.text());
    return [];
  }

  const data: NotesResponse = await res.json();
  return data.items;
}

export default async function BookDetailPage({ params }: PageProps) {
  const { id: bookId } = await params;

  // Obtener usuario actual desde Supabase server client
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    notFound();
  }

  // Obtener access token para llamar a la API backend
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    notFound();
  }

  // Fetch libro + notas en paralelo
  const [book, notes] = await Promise.all([
    fetchBook(session.access_token, bookId),
    fetchNotes(session.access_token, bookId),
  ]);

  // 404 si no existe o no pertenece al usuario
  if (!book || book.user_id !== user.id) {
    notFound();
  }

  return <BookDetailClient book={book} notes={notes} />;
}
