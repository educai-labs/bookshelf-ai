// Cliente API de chat (feature 017).
//
// `POST /api/v1/ai/chat` con streaming SSE consumido vía `fetch` + `ReadableStream`.
// Se usa `fetch` (y no `EventSource`) porque el endpoint es `POST` y requiere
// cuerpo JSON + header `Authorization` (JWT de Supabase), algo que `EventSource`
// no permite. El contrato TypeScript es camelCase; en el wire se serializa a
// snake_case (`book_id`) para coincidir con el modelo Pydantic del backend.

import { supabase } from "@/lib/supabase/client";
import { ApiError } from "@/lib/api/books";

/** Modo de contexto del chat. */
export type ChatMode = "book" | "rag";

/** Payload camelCase de la petición (espejo de `ChatRequest`). */
export interface ChatRequestPayload {
  query: string;
  bookId?: string;
  mode?: ChatMode;
}

/** Evento SSE parseado del stream (`chunk` | `error` + `done`). */
export interface ChatStreamChunk {
  chunk?: string;
  error?: string;
  done: boolean;
}

/** Headers comunes con el token de acceso de la sesión Supabase. */
async function authHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};
}

/** Serializa el payload camelCase a snake_case para el wire. */
function toWire(payload: ChatRequestPayload): Record<string, unknown> {
  return {
    query: payload.query,
    book_id: payload.bookId,
    mode: payload.mode,
  };
}

/**
 * Parsea un evento SSE crudo (líneas entre `\n\n`) a un `ChatStreamChunk`.
 *
 * Tolerante a líneas no `data:`, a `[DONE]` y a JSON inválido (devuelve `null`
 * para que el consumidor lo ignore). Expuesto para test unitario (feature 017).
 */
export function parseSseEvent(raw: string): ChatStreamChunk | null {
  const lines = raw.split("\n");
  const dataLine = lines.find((line) => line.startsWith("data:"));
  if (!dataLine) return null;

  const data = dataLine.slice("data:".length).trim();
  if (data === "[DONE]") return { done: true };

  try {
    const parsed = JSON.parse(data) as Record<string, unknown>;
    if (typeof parsed !== "object" || parsed === null) return null;
    return {
      chunk: typeof parsed.chunk === "string" ? parsed.chunk : undefined,
      error: typeof parsed.error === "string" ? parsed.error : undefined,
      done: parsed.done === true,
    };
  } catch {
    return null;
  }
}

/**
 * Envía la consulta y devuelve un iterador async de eventos SSE.
 *
 * Consume el `ReadableStream` incrementalmente con un buffer de texto, tolerante
 * a que un evento quede partido entre dos lecturas (acumula hasta `\n\n`).
 * Lanza `ApiError` si el backend responde con error HTTP (antes del stream) y
 * `Error` si la respuesta no trae cuerpo legible.
 */
export async function* streamChat(
  payload: ChatRequestPayload,
): AsyncGenerator<ChatStreamChunk> {
  const headers = await authHeaders();
  const res = await fetch("/api/v1/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(toWire(payload)),
  });

  if (!res.ok) {
    const errorData = (await res.json().catch(() => ({}))) as {
      code?: string;
      message?: string;
    };
    const code = errorData.code ?? "CHAT_FAILED";
    const message =
      code === "GEMINI_KEY_MISSING"
        ? "El chat no está configurado. Añade GEMINI_API_KEY en el servidor."
        : (errorData.message ?? "No se pudo iniciar el chat");
    throw new ApiError(res.status, code, message);
  }

  if (!res.body) {
    throw new ApiError(
      0,
      "NO_STREAM_BODY",
      "La respuesta no incluye un cuerpo de streaming",
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const raw = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const chunk = parseSseEvent(raw);
        if (chunk) {
          yield chunk;
          if (chunk.done) return;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
