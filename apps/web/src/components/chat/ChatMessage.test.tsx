// Tests de ChatMessage (feature 029): memoización del renderizado Markdown
// (Z4-02), texto plano para mensajes de usuario e id estable.

import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChatMessage } from "./ChatMessage";

vi.mock("@/utils/markdown", () => ({
  renderMarkdownToHtml: vi.fn((markdown: string) => `<p>${markdown}</p>`),
}));

vi.mock("@/lib/i18n", () => ({
  useTranslation: () => ({
    language: "es",
    t: (key: string) => key,
  }),
}));

import { renderMarkdownToHtml } from "@/utils/markdown";

const renderMarkdownSpy = vi.mocked(renderMarkdownToHtml);

beforeEach(() => {
  renderMarkdownSpy.mockClear();
});

describe("ChatMessage", () => {
  it("renderiza el mensaje de usuario como texto plano sin parsear Markdown", () => {
    const { getByText } = render(
      <ChatMessage
        message={{ id: "u1", role: "user", content: "**negrita**" }}
      />,
    );

    expect(getByText("**negrita**")).toBeInTheDocument();
    expect(renderMarkdownSpy).not.toHaveBeenCalled();
  });

  it("renderiza el mensaje de asistente como HTML sanitizado", () => {
    render(
      <ChatMessage
        message={{ id: "a1", role: "assistant", content: "hola" }}
      />,
    );

    expect(renderMarkdownSpy).toHaveBeenCalledTimes(1);
    expect(renderMarkdownSpy).toHaveBeenCalledWith("hola");
  });

  it("memoiza el HTML por contenido y no re-parsea con re-renders ajenos", () => {
    const { rerender } = render(
      <ChatMessage
        message={{ id: "a1", role: "assistant", content: "hola" }}
      />,
    );
    expect(renderMarkdownSpy).toHaveBeenCalledTimes(1);

    // Re-render del padre con un objeto nuevo (misma identidad de contenido):
    // el `useMemo` dependiente de `message.content` no re-ejecuta el parseo.
    rerender(
      <ChatMessage
        message={{ id: "a1", role: "assistant", content: "hola" }}
      />,
    );
    expect(renderMarkdownSpy).toHaveBeenCalledTimes(1);

    // Cambio real de contenido → sí se re-parsea.
    rerender(
      <ChatMessage
        message={{ id: "a1", role: "assistant", content: "adiós" }}
      />,
    );
    expect(renderMarkdownSpy).toHaveBeenCalledTimes(2);
  });

  it("expone el id estable del mensaje en el DOM", () => {
    const { container } = render(
      <ChatMessage message={{ id: "msg-42", role: "user", content: "x" }} />,
    );

    expect(container.querySelector("[data-message-id='msg-42']")).toBeTruthy();
  });
});
