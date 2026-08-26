// Tests del componente ChatPage (feature 017): render progresivo, selección de
// modo, error handling, sessionStorage y `book_id`. Mockea `streamChat` y
// `next/navigation`.

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChatPage } from "../ChatPage";
import { streamChat } from "@/lib/api/chat";

const navMocks = vi.hoisted(() => ({ searchParams: new URLSearchParams() }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => navMocks.searchParams,
}));

vi.mock("@/lib/api/chat", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/chat")>();
  return { ...actual, streamChat: vi.fn() };
});

const mockedStreamChat = vi.mocked(streamChat);

beforeEach(() => {
  sessionStorage.clear();
  navMocks.searchParams = new URLSearchParams();
  mockedStreamChat.mockReset();
});

describe("ChatPage", () => {
  it("renderiza el estado vacío", () => {
    render(<ChatPage />);

    expect(
      screen.getByText(
        /Pregunta a tu biblioteca o habla con uno de tus libros/,
      ),
    ).toBeInTheDocument();
  });

  it("envía la consulta y renderiza la respuesta progresiva token a token", async () => {
    const user = userEvent.setup();
    mockedStreamChat.mockImplementation(async function* () {
      yield { chunk: "Hola", done: false };
      yield { chunk: " mundo", done: false };
      yield { chunk: "", done: true };
    });

    render(<ChatPage />);

    await user.type(screen.getByLabelText("Mensaje"), "¿hola?");
    await user.click(screen.getByLabelText("Enviar mensaje"));

    // Mensaje del usuario + respuesta del asistente renderizada.
    expect(await screen.findByText("¿hola?")).toBeInTheDocument();
    expect(await screen.findByText(/Hola mundo/)).toBeInTheDocument();
  });

  it("deshabilita el envío con consulta vacía", () => {
    render(<ChatPage />);

    expect(screen.getByLabelText("Enviar mensaje")).toBeDisabled();
  });

  it("muestra el error cuando el stream emite un evento de error", async () => {
    const user = userEvent.setup();
    mockedStreamChat.mockImplementation(async function* () {
      yield { error: "Error del servicio de IA", done: true };
    });

    render(<ChatPage />);

    await user.type(screen.getByLabelText("Mensaje"), "hola");
    await user.click(screen.getByLabelText("Enviar mensaje"));

    expect(await screen.findByTestId("chat-error")).toHaveTextContent(
      "Error del servicio de IA",
    );
  });

  it("persiste el historial en sessionStorage con forma { role, content }", async () => {
    const user = userEvent.setup();
    mockedStreamChat.mockImplementation(async function* () {
      yield { chunk: "respuesta", done: false };
      yield { chunk: "", done: true };
    });

    render(<ChatPage />);

    await user.type(screen.getByLabelText("Mensaje"), "hola");
    await user.click(screen.getByLabelText("Enviar mensaje"));
    await screen.findByText("respuesta");

    const history = JSON.parse(sessionStorage.getItem("chat_history") ?? "[]");
    expect(history).toHaveLength(2);
    expect(history[0]).toEqual({ role: "user", content: "hola" });
    expect(history[1]).toEqual({ role: "assistant", content: "respuesta" });
  });

  it("hidrata el historial desde sessionStorage al montar", () => {
    sessionStorage.setItem(
      "chat_history",
      JSON.stringify([
        { role: "user", content: "previo" },
        { role: "assistant", content: "respuesta previa" },
      ]),
    );

    render(<ChatPage />);

    expect(screen.getByText("previo")).toBeInTheDocument();
    expect(screen.getByText("respuesta previa")).toBeInTheDocument();
  });

  it("descarta de forma segura un JSON inválido en sessionStorage", () => {
    sessionStorage.setItem("chat_history", "{no-json");

    render(<ChatPage />);

    expect(
      screen.getByText(
        /Pregunta a tu biblioteca o habla con uno de tus libros/,
      ),
    ).toBeInTheDocument();
  });

  it("descarta historial con forma inválida en sessionStorage", () => {
    sessionStorage.setItem(
      "chat_history",
      JSON.stringify([{ role: "admin", content: "no válido" }, "basura"]),
    );

    render(<ChatPage />);

    expect(
      screen.getByText(
        /Pregunta a tu biblioteca o habla con uno de tus libros/,
      ),
    ).toBeInTheDocument();
  });

  it("muestra el selector de contexto cuando hay book_id", () => {
    navMocks.searchParams = new URLSearchParams("book_id=BOOK_123");

    render(<ChatPage />);

    expect(screen.getByText("Contexto:")).toBeInTheDocument();
    expect(screen.getByLabelText("Modo de contexto")).toBeInTheDocument();
  });
});
