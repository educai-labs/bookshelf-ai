"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import {
  streamChat,
  type ChatMode,
  type ChatRequestPayload,
} from "@/lib/api/chat";
import { ApiError } from "@/lib/api/books";
import { useSettings } from "@/contexts/SettingsContext";
import { useTranslation } from "@/lib/i18n";
import { ChatInput } from "./ChatInput";
import { ChatMessage, type ChatMessageData } from "./ChatMessage";

/**
 * Página de chat (feature 017, adaptada en 022). Lee el `book_id` opcional de
 * `searchParams`, permite seleccionar contexto libro/RAG, envía `POST /ai/chat`
 * y pinta la respuesta token a token. Consume únicamente `useSettings` para el
 * historial (sessionStorage), el modo inicial, el idioma y la visibilidad.
 */
export function ChatPage() {
  const searchParams = useSearchParams();
  const bookId = searchParams.get("book_id") ?? undefined;

  const { t, language } = useTranslation();
  const { settings, loadChatHistory, saveChatHistory } = useSettings();

  const initialMode: ChatMode =
    settings.chat.initialMode === "library" ? "rag" : bookId ? "book" : "rag";

  const [messages, setMessages] = useState<ChatMessageData[]>(() =>
    settings.chat.showHistory ? loadChatHistory() : [],
  );
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<ChatMode>(initialMode);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Persiste el historial tras cada cambio (contrato `{ role, content }`).
  useEffect(() => {
    if (settings.chat.showHistory) {
      saveChatHistory(messages);
    }
  }, [messages, settings.chat.showHistory, saveChatHistory]);

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

    const payload: ChatRequestPayload =
      mode === "book" && bookId ? { query, bookId, mode } : { query, mode };

    // `respondInInterfaceLanguage` (sección 3.4): solo se envía el idioma si la
    // preferencia está activada. `useNotesForSearch` (sección 3.6): controla si
    // las notas del usuario entran en el contexto RAG/chat.
    if (settings.chat.respondInInterfaceLanguage) {
      payload.language = language;
    }
    payload.useNotes = settings.privacy.useNotesForSearch;

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
      // Traduce por código (nunca muestra literales en español del cliente API).
      setError(
        err instanceof ApiError
          ? t(
              err.code === "GEMINI_KEY_MISSING"
                ? "chat.notConfigured"
                : err.code === "NO_STREAM_BODY"
                  ? "chat.noStreamBody"
                  : "chat.unexpected",
            )
          : err instanceof Error
            ? err.message
            : t("chat.unexpected"),
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
  }, [input, isStreaming, mode, bookId, language, t, settings]);

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
              {t("chat.empty")}
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
              {t("chat.thinking")}
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
