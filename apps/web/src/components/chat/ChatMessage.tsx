"use client";

import { cn } from "@/lib/utils";
import { renderMarkdownToHtml } from "@/utils/markdown";

/** Mensaje de la conversación (contrato de sesión: `{ role, content }`). */
export interface ChatMessageData {
  role: "user" | "assistant";
  content: string;
}

interface ChatMessageProps {
  message: ChatMessageData;
}

/**
 * Burbuja de chat: el mensaje del usuario se muestra como texto plano
 * (`whitespace-pre-wrap`); el del asistente se renderiza como Markdown
 * sanitizado (DOMPurify) antes de `dangerouslySetInnerHTML`.
 */
export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
      <div className="flex size-8 flex-shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
        {isUser ? "Tú" : "IA"}
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
            dangerouslySetInnerHTML={{
              __html: renderMarkdownToHtml(message.content),
            }}
          />
        )}
      </div>
    </div>
  );
}
