"use client";

import { useMemo } from "react";

import { cn } from "@/lib/utils";
import { renderMarkdownToHtml } from "@/utils/markdown";
import { useTranslation } from "@/lib/i18n";

/** Mensaje de la conversación (contrato interno con id estable). */
export interface ChatMessageData {
  id: string;
  role: "user" | "assistant";
  content: string;
}

/** Historial serializado en `sessionStorage` (sin el id interno). */
export interface ChatHistoryEntry {
  role: "user" | "assistant";
  content: string;
}

let nextMessageId = 0;

/** Genera un id estable y único en cliente para cada mensaje del chat. */
export function createMessageId(): string {
  nextMessageId += 1;
  return `msg-${nextMessageId}`;
}

/**
 * Asigna ids estables a un historial serializado `{ role, content }`. Los
 * historiales antiguos (sin id) se normalizan al hidratarlos; los mensajes
 * nuevos reciben su id al crearse. No altera la forma persistida.
 */
export function hydrateMessages(
  history: ChatHistoryEntry[],
): ChatMessageData[] {
  return history.map((message) => ({
    ...message,
    id: createMessageId(),
  }));
}

interface ChatMessageProps {
  message: ChatMessageData;
}

/**
 * Burbuja de chat: el mensaje del usuario se muestra como texto plano
 * (`whitespace-pre-wrap`); el del asistente se renderiza como Markdown
 * sanitizado (DOMPurify) antes de `dangerouslySetInnerHTML`. El HTML del
 * asistente se memoiza por `message.content` (Z4-02) para no re-ejecutar
 * `marked` + DOMPurify en re-renders ajenos (p. ej. otro mensaje streamando).
 */
export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";
  const { t } = useTranslation();

  const assistantHtml = useMemo(
    () => (isUser ? "" : renderMarkdownToHtml(message.content)),
    [isUser, message.content],
  );

  return (
    <div
      data-message-id={message.id}
      className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}
    >
      <div className="flex size-8 flex-shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
        {isUser ? t("chat.you") : t("chat.ai")}
      </div>
      <div
        data-testid={`chat-message-${message.role}`}
        className={cn(
          "max-w-[80%] rounded-lg px-4 py-2 text-sm",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground",
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        ) : (
          <div
            className="prose prose-sm max-w-none break-words"
            dangerouslySetInnerHTML={{ __html: assistantHtml }}
          />
        )}
      </div>
    </div>
  );
}
