"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bold, Italic, Code, Link, Type, List, Quote } from "lucide-react";
import { cn } from "@/lib/utils";
import { Note, createNote } from "@/lib/api/books";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { insertAtCursor } from "@/utils/markdown";
import { sanitizeHtml } from "@/utils/sanitize";
import { useTranslation } from "@/lib/i18n";
import { useSettings } from "@/contexts/SettingsContext";

interface NoteEditorProps {
  bookId: string;
  onNoteCreated?: (note: Note) => void;
}

const DEBOUNCE_MS = 300;

export function NoteEditor({ bookId, onNoteCreated }: NoteEditorProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { settings } = useSettings();

  const TOOLBAR_BUTTONS = [
    { icon: Bold, markdown: "**", label: t("notes.toolbar.bold") },
    { icon: Italic, markdown: "*", label: t("notes.toolbar.italic") },
    { icon: Code, markdown: "`", label: t("notes.toolbar.inlineCode") },
    { icon: Link, markdown: "[texto](url)", label: t("notes.toolbar.link") },
    { icon: Type, markdown: "## ", label: t("notes.toolbar.heading") },
    { icon: List, markdown: "- ", label: t("notes.toolbar.list") },
    { icon: Quote, markdown: "> ", label: t("notes.toolbar.quote") },
  ] as const;

  const [content, setContent] = useState("");
  const [previewContent, setPreviewContent] = useState("");
  const [activeTab, setActiveTab] = useState<"edit" | "preview">("edit");
  const handleTabChange = (value: string) => {
    setActiveTab(value as "edit" | "preview");
  };
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced preview update
  const updatePreview = useCallback((markdown: string) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      setPreviewContent(sanitizeHtml(markdown));
    }, DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    updatePreview(content);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [content, updatePreview]);

  const mutation = useMutation({
    mutationFn: (content: string) => createNote(bookId, { content }),
    onMutate: async (newContent) => {
      // Cancelar queries salientes
      await queryClient.cancelQueries({ queryKey: ["bookNotes", bookId] });

      // Snapshot previo
      const previousNotes = queryClient.getQueryData(["bookNotes", bookId]);

      // Optimistic update: añadir nota temporal
      const tempNote: Note = {
        id: `temp-${Date.now()}`,
        book_id: bookId,
        content: newContent,
        content_html: sanitizeHtml(newContent),
        chunk_index: 0,
        created_at: new Date().toISOString(),
      };

      queryClient.setQueryData<Note[]>(["bookNotes", bookId], (old) =>
        old ? [tempNote, ...old] : [tempNote],
      );

      return { previousNotes };
    },
    onSuccess: (note) => {
      queryClient.invalidateQueries({ queryKey: ["bookNotes", bookId] });
      setContent("");
      setPreviewContent("");
      toast.success(t("notes.saved"));
      onNoteCreated?.(note);
      router.refresh();
    },
    onError: (error, _newContent, context) => {
      // Rollback
      if (context?.previousNotes) {
        queryClient.setQueryData(["bookNotes", bookId], context.previousNotes);
      }
      // Notificación de errores (sección 3.5): solo si está activada.
      if (settings.notifications.errors) {
        toast.error(`${t("notes.errorSaving")}: ${error.message}`);
      }
    },
  });

  const handleSave = () => {
    if (!content.trim()) return;
    mutation.mutate(content);
  };

  const handleToolbarClick = (markdown: string) => {
    if (textareaRef.current) {
      insertAtCursor(textareaRef.current, markdown);
    }
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-1 rounded-t-lg border bg-muted/50 p-2">
        {TOOLBAR_BUTTONS.map(({ icon: Icon, markdown, label }) => (
          <button
            key={label}
            type="button"
            onClick={() => handleToolbarClick(markdown)}
            className={cn(
              "rounded p-1.5 transition-colors hover:bg-muted",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
            title={label}
            aria-label={label}
          >
            <Icon className="size-4" />
          </button>
        ))}
      </div>

      {/* Editor / Preview */}
      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="space-y-0"
      >
        <TabsList className="grid w-full grid-cols-2 rounded-t-lg bg-muted p-1">
          <TabsTrigger value="edit">{t("notes.edit")}</TabsTrigger>
          <TabsTrigger value="preview">{t("notes.preview")}</TabsTrigger>
        </TabsList>

        <TabsContent value="edit" className="mt-0">
          <Textarea
            ref={textareaRef}
            value={content}
            onChange={handleContentChange}
            placeholder={t("notes.writePlaceholder")}
            className="min-h-[200px] resize-y rounded-t-none border-t-0 font-mono text-sm"
            rows={10}
          />
        </TabsContent>

        <TabsContent value="preview" className="mt-0">
          <div
            className="prose prose-sm min-h-[200px] max-w-none rounded-b-lg border border-t-0 bg-background p-4"
            dangerouslySetInnerHTML={{
              __html:
                previewContent ||
                `<p className='text-muted-foreground italic'>${t("notes.emptyPreview")}</p>`,
            }}
          />
        </TabsContent>
      </Tabs>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={mutation.isPending || !content.trim()}
          className="w-full sm:w-auto"
        >
          {mutation.isPending ? t("notes.saving") : t("notes.save")}
        </Button>
      </div>
    </div>
  );
}
