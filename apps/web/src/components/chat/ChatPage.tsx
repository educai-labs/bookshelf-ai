"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { streamChat, type ChatMode } from "@/lib/api/chat";
import { ChatInput } from "./ChatInput";
import { ChatMessage, type ChatMessageData } from "./ChatMessage";

const STORAGE_KEY = "chat_history";

function isStoredMessage(value: unknown): value is ChatMessageData {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as ChatMessageData).role !== undefined &&
    ((value as ChatMessageData).role === "user" ||
      (value as ChatMessageData).role === "assistant") &&
    typeof (value as ChatMessageData).content === "string"
  );
}

/** Hidrata el historial desde `sessionStorage` descartando JSON inválido/antiguo. */
function loadHistory(): ChatMessageData[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStoredMessage);
  } catch {
    return [];
  }
}

function saveHistory(messages: ChatMessageData[]): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  } catch {
    // Cuota/privacidad: no interrumpir el chat por un fallo de almacenamiento.
  }
}

/**
 * Página de chat (feature 017). Lee el `book_id` opcional de `searchParams`,
 * permite seleccionar contexto libro/RAG, envía `POST /ai/chat` y pinta la
 * respuesta token a token. El historial vive exclusivamente en `sessionStorage`.
 */
export function ChatPage() {
  const searchParams = useSearchParams();
  const bookId = searchParams.get("book_id") ?? undefined;

  const [messages, setMessages] = useState<ChatMessageData[]>(loadHistory);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<ChatMode>(bookId ? "book" : "rag");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Persiste el historial tras cada cambio (contrato `{ role, content }`).
  useEffect(() => {
    saveHistory(messages);
  }, [messages]);

  // Auto-scroll al último mensaje.
  useEffect(() => {
    const el = scrollRef.current;
    el?.scrollTo?.({ top: el.scrollHeight });
  }, [messages]);

  const handleModeChange = useCallback((next: ChatMode) => {
    setMode(next);
    setError(null);
  }, []);

  const handleSend = useCallback(async () => {
    const query = input.trim();
    if (!query || isStreaming) return;

    setInput("");
    setError(null);
    setIsStreaming(true);
    setMessages((prev) => [
      ...prev,
      { role: "user", content: query },
      { role: "assistant", content: "" },
    ]);

    const payload =
      mode === "book" && bookId ? { query, bookId, mode } : { query, mode };

    try {
      for await (const chunk of streamChat(payload)) {
        if (chunk.error) {
          setError(chunk.error);
          break;
        }
        if (chunk.done) break;
        const token = chunk.chunk ?? "";
        if (token) {
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            next[next.length - 1] = { ...last, content: last.content + token };
            return next;
          });
        }
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error inesperado del chat",
      );
    } finally {
      setIsStreaming(false);
      // Descarta la burbuja vacía del asistente si no se produjo contenido.
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === "assistant" && last.content === "") {
          return prev.slice(0, -1);
        }
        return prev;
      });
    }
  }, [input, isStreaming, mode, bookId]);

  const thinking = isStreaming;

  return (
    <Card className="mx-auto flex h-[calc(100vh-8rem)] max-w-3xl flex-col">
      <CardContent className="flex flex-1 flex-col gap-4 overflow-hidden p-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription data-testid="chat-error">
              {error}
            </AlertDescription>
          </Alert>
        )}

        <div
          ref={scrollRef}
          data-testid="chat-messages"
          className="flex flex-1 flex-col gap-4 overflow-y-auto p-2"
        >
          {messages.length === 0 && (
            <p className="mt-8 text-center text-sm text-muted-foreground">
              Pregunta a tu biblioteca o habla con uno de tus libros.
            </p>
          )}
          {messages.map((message, index) => (
            <ChatMessage key={index} message={message} />
          ))}
          {thinking && (
            <div
              data-testid="chat-thinking"
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <Loader2 className="size-4 animate-spin" />
              Pensando...
            </div>
          )}
        </div>

        <ChatInput
          value={input}
          onChange={setInput}
          onSend={handleSend}
          disabled={isStreaming}
          mode={mode}
          onModeChange={handleModeChange}
          showModeSelector={Boolean(bookId)}
        />
      </CardContent>
    </Card>
  );
}
