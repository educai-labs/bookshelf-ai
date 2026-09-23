// Tests del componente ChatPage (feature 017): render progresivo, selección de
// modo, error handling, sessionStorage y `book_id`. Mockea `streamChat` y
// `next/navigation`.

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChatPage } from "../ChatPage";
import { streamChat } from "@/lib/api/chat";

const navMocks = vi.hoisted(() => ({ searchParams: new URLSearchParams() }));

// Estado de preferencias controlable por test (feature 022).
const settingsState = vi.hoisted(() => ({
  language: "es",
  respondInInterfaceLanguage: true,
  useNotesForSearch: true,
  showHistory: true,
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => navMocks.searchParams,
}));

vi.mock("@/lib/api/chat", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/chat")>();
  return { ...actual, streamChat: vi.fn() };
});

vi.mock("@/contexts/SettingsContext", () => ({
  useSettings: () => ({
    settings: {
      language: settingsState.language,
      theme: "system",
      reader: {
        fontSize: 16,
        lineWidth: 720,
        lineHeight: 1.6,
        font: "system",
        showBookDetails: true,
        confirmDeletions: true,
      },
      chat: {
        initialMode: "book",
        showHistory: settingsState.showHistory,
        clearHistoryOnLogout: true,
        respondInInterfaceLanguage: settingsState.respondInInterfaceLanguage,
        autoRecommendations: true,
      },
      notifications: {
        errors: true,
        vectorizationDone: true,
        recommendations: true,
        account: true,
      },
      privacy: { useNotesForSearch: settingsState.useNotesForSearch },
    },
    language: settingsState.language,
    loadChatHistory: () => {
      try {
        const raw = sessionStorage.getItem("chat_history");
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(
          (m: unknown) =>
            typeof m === "object" &&
            m !== null &&
            ((m as { role?: string }).role === "user" ||
              (m as { role?: string }).role === "assistant") &&
            typeof (m as { content?: unknown }).content === "string",
        );
      } catch {
        return [];
      }
    },
    saveChatHistory: (messages: unknown[]) =>
      sessionStorage.setItem("chat_history", JSON.stringify(messages)),
    clearChatHistory: () => sessionStorage.removeItem("chat_history"),
    setLanguage: vi.fn(),
    theme: "system",
    resolvedTheme: "system",
    setTheme: vi.fn(),
    updateReader: vi.fn(),
    updateChat: vi.fn(),
    updateNotifications: vi.fn(),
    updatePrivacy: vi.fn(),
    isAccountLoaded: true,
    accountError: null,
    reducedMotion: false,
    restoreDefaults: vi.fn(),
  }),
}));

const mockedStreamChat = vi.mocked(streamChat);

beforeEach(() => {
  sessionStorage.clear();
  navMocks.searchParams = new URLSearchParams();
  mockedStreamChat.mockReset();
  settingsState.language = "es";
  settingsState.respondInInterfaceLanguage = true;
  settingsState.useNotesForSearch = true;
  settingsState.showHistory = true;
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

  it("incluye language en el payload cuando respondInInterfaceLanguage está activada", async () => {
    const user = userEvent.setup();
    mockedStreamChat.mockImplementation(async function* () {
      yield { chunk: "", done: true };
    });

    render(<ChatPage />);

    await user.type(screen.getByLabelText("Mensaje"), "hola");
    await user.click(screen.getByLabelText("Enviar mensaje"));

    await waitFor(() => expect(mockedStreamChat).toHaveBeenCalledTimes(1));
    const payload = mockedStreamChat.mock.calls[0][0];
    expect(payload.language).toBe("es");
    expect(payload.useNotes).toBe(true);
  });

  it("omite language cuando respondInInterfaceLanguage está desactivada", async () => {
    settingsState.respondInInterfaceLanguage = false;
    const user = userEvent.setup();
    mockedStreamChat.mockImplementation(async function* () {
      yield { chunk: "", done: true };
    });

    render(<ChatPage />);

    await user.type(screen.getByLabelText("Mensaje"), "hola");
    await user.click(screen.getByLabelText("Enviar mensaje"));

    await waitFor(() => expect(mockedStreamChat).toHaveBeenCalledTimes(1));
    const payload = mockedStreamChat.mock.calls[0][0];
    expect(payload.language).toBeUndefined();
    expect(payload.useNotes).toBe(true);
  });

  it("envía useNotes=false cuando useNotesForSearch está desactivada", async () => {
    settingsState.useNotesForSearch = false;
    const user = userEvent.setup();
    mockedStreamChat.mockImplementation(async function* () {
      yield { chunk: "", done: true };
    });

    render(<ChatPage />);

    await user.type(screen.getByLabelText("Mensaje"), "hola");
    await user.click(screen.getByLabelText("Enviar mensaje"));

    await waitFor(() => expect(mockedStreamChat).toHaveBeenCalledTimes(1));
    const payload = mockedStreamChat.mock.calls[0][0];
    expect(payload.useNotes).toBe(false);
  });
});
