"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
import {
  ChatMessage,
  createMessageId,
  hydrateMessages,
  type ChatHistoryEntry,
  type ChatMessageData,
} from "./ChatMessage";

/** Ventana de debounce para persistir el historial (Z4-01, ≥300 ms). */
const PERSIST_DEBOUNCE_MS = 300;

/**
 * Página de chat (feature 017, adaptada en 022). Lee el `book_id` opcional de
 * `searchParams`, permite seleccionar contexto libro/RAG, envía `POST /ai/chat`
 * y pinta la respuesta token a token. Consume únicamente `useSettings` para el
 * historial (sessionStorage), el modo inicial, el idioma, la visibilidad y la
 * preferencia de movimiento reducido.
 *
 * Control del stream (Z4-03/Z4-06): mantiene un `AbortController` por envío,
 * aborta en cleanup/navegación y ofrece el botón "Detener" durante el streaming.
 * Persistencia (Z4-01): debounce + flush, no por token.
 */
export function ChatPage() {
  const searchParams = useSearchParams();
  const bookId = searchParams.get("book_id") ?? undefined;

  const { t, language } = useTranslation();
  const { settings, loadChatHistory, saveChatHistory, reducedMotion } =
    useSettings();

  const initialMode: ChatMode =
    settings.chat.initialMode === "library" ? "rag" : bookId ? "book" : "rag";

  const [messages, setMessages] = useState<ChatMessageData[]>(() =>
    settings.chat.showHistory ? hydrateMessages(loadChatHistory()) : [],
  );
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<ChatMode>(initialMode);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const lastUserQueryRef = useRef<string | null>(null);

  // Ref con el último estado de mensajes (para el flush de persistencia sin
  // depender del timing del re-render).
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // --- Persistencia con debounce + flush (Z4-01) ---------------------------
  const clearPersistTimer = useCallback(() => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
  }, []);

  const persistNow = useCallback(() => {
    clearPersistTimer();
    if (!settings.chat.showHistory) return;
    const serialized: ChatHistoryEntry[] = messagesRef.current.map(
      ({ role, content }) => ({ role, content }),
    );
    saveChatHistory(serialized);
  }, [clearPersistTimer, settings.chat.showHistory, saveChatHistory]);

  // Debounce de persistencia: se reprograma en cada cambio de mensajes y se
  // limpia al desmontar. El estado final se garantiza con `persistNow` al
  // terminar/detener el stream (no se escribe por token).
  useEffect(() => {
    if (!settings.chat.showHistory) return;
    persistTimerRef.current = setTimeout(persistNow, PERSIST_DEBOUNCE_MS);
    return clearPersistTimer;
  }, [messages, settings.chat.showHistory, persistNow, clearPersistTimer]);

  // Auto-scroll al último mensaje respetando `prefers-reduced-motion` (Z4-09).
  // Con la preferencia activa no hay animación (`auto`); en caso contrario se
  // mantiene el auto-scroll con desplazamiento suave.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo?.({
      top: el.scrollHeight,
      behavior: reducedMotion ? "auto" : "smooth",
    });
  }, [messages, reducedMotion]);

  // Ciclo de vida: marca desmontado y aborta el stream en curso al salir.
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      clearPersistTimer();
      abortControllerRef.current?.abort();
    };
  }, [clearPersistTimer]);

  const handleModeChange = useCallback((next: ChatMode) => {
    setMode(next);
    setError(null);
  }, []);

  const sendQuery = useCallback(
    async (query: string, appendUser: boolean) => {
      const payload: ChatRequestPayload =
        mode === "book" && bookId ? { query, bookId, mode } : { query, mode };

      // `respondInInterfaceLanguage` (sección 3.4): solo se envía el idioma si
      // la preferencia está activada. `useNotesForSearch` (sección 3.6):
      // controla si las notas del usuario entran en el contexto RAG/chat.
      if (settings.chat.respondInInterfaceLanguage) {
        payload.language = language;
      }
      payload.useNotes = settings.privacy.useNotesForSearch;

      const controller = new AbortController();
      abortControllerRef.current = controller;

      setError(null);
      setIsStreaming(true);

      const userMessage: ChatMessageData = {
        id: createMessageId(),
        role: "user",
        content: query,
      };
      const assistantMessage: ChatMessageData = {
        id: createMessageId(),
        role: "assistant",
        content: "",
      };
      setMessages((prev) =>
        appendUser
          ? [...prev, userMessage, assistantMessage]
          : [...prev, assistantMessage],
      );

      try {
        for await (const chunk of streamChat(payload, controller.signal)) {
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
              if (last && last.role === "assistant") {
                next[next.length - 1] = {
                  ...last,
                  content: last.content + token,
                };
              }
              return next;
            });
          }
        }
      } catch (err) {
        // Distingue la cancelación intencionada (abort) de un error visible:
        // el abort conserva el texto parcial y no presenta error (Z4-03/Z4-06).
        if (!controller.signal.aborted) {
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
        }
      } finally {
        if (isMountedRef.current) {
          setIsStreaming(false);
          abortControllerRef.current = null;
          // Descarta la burbuja vacía del asistente si no se produjo contenido.
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === "assistant" && last.content === "") {
              return prev.slice(0, -1);
            }
            return prev;
          });
          // Flush del historial al finalizar/detener (conserva el texto parcial).
          persistNow();
        }
      }
    },
    [mode, bookId, language, settings, t, persistNow],
  );

  const handleSend = useCallback(async () => {
    const query = input.trim();
    if (!query || isStreaming) return;
    setInput("");
    lastUserQueryRef.current = query;
    await sendQuery(query, true);
  }, [input, isStreaming, sendQuery]);

  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const handleRetry = useCallback(() => {
    const query = lastUserQueryRef.current;
    if (!query || isStreaming) return;
    void sendQuery(query, false);
  }, [isStreaming, sendQuery]);

  const thinking = isStreaming;

  return (
    <Card className="mx-auto flex h-[calc(100vh-8rem)] max-w-3xl flex-col">
      <CardContent className="flex flex-1 flex-col gap-4 overflow-hidden p-4">
        {error && (
          <Alert variant="destructive">
            <AlertTitle>{t("chat.errorTitle")}</AlertTitle>
            <AlertDescription data-testid="chat-error">
              {error}
            </AlertDescription>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRetry}
              className="mt-2"
            >
              {t("chat.retry")}
            </Button>
          </Alert>
        )}

        <div
          ref={scrollRef}
          data-testid="chat-messages"
          aria-live="polite"
          className="flex flex-1 flex-col gap-4 overflow-y-auto p-2"
        >
          {messages.length === 0 && (
            <p className="mt-8 text-center text-sm text-muted-foreground">
              {t("chat.empty")}
            </p>
          )}
          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}
          {thinking && (
            <div
              data-testid="chat-thinking"
              role="status"
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
          onStop={handleStop}
          disabled={isStreaming}
          mode={mode}
          onModeChange={handleModeChange}
          showModeSelector={Boolean(bookId)}
        />
      </CardContent>
    </Card>
  );
}
