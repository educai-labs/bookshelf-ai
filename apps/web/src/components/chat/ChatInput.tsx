"use client";

import { SendHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "@/lib/i18n";
import type { ChatMode } from "@/lib/api/chat";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled: boolean;
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  /** Mostrar selector libro/RAG (solo cuando hay `book_id`). */
  showModeSelector: boolean;
}

/**
 * Campo de entrada del chat: textarea + botón enviar + selector de contexto.
 * Evita envíos vacíos (`canSend`) y envía con Enter (Shift+Enter = salto de línea).
 */
export function ChatInput({
  value,
  onChange,
  onSend,
  disabled,
  mode,
  onModeChange,
  showModeSelector,
}: ChatInputProps) {
  const canSend = value.trim().length > 0 && !disabled;
  const { t } = useTranslation();

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (canSend) onSend();
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {showModeSelector && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {t("chat.contextLabel")}
          </span>
          <Select
            value={mode}
            onValueChange={(next) => onModeChange(next as ChatMode)}
          >
            <SelectTrigger
              className="w-[180px]"
              aria-label={t("chat.modeAria")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="book">{t("chat.thisBook")}</SelectItem>
              <SelectItem value="rag">{t("chat.wholeLibrary")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex items-end gap-2">
        <Textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("chat.placeholder")}
          disabled={disabled}
          aria-label={t("chat.messageAria")}
          className="min-h-[52px] flex-1 resize-none"
        />
        <Button
          onClick={onSend}
          disabled={!canSend}
          aria-label={t("chat.sendAria")}
          size="icon"
        >
          <SendHorizontal className="size-4" />
        </Button>
      </div>
    </div>
  );
}
