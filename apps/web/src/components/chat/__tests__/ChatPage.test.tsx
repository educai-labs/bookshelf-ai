// Tests del componente ChatPage (feature 017, adaptado en 029): render
// progresivo, selección de modo, error handling, sessionStorage, `book_id`,
// control del stream (abort), a11y (aria-live/role/ids), scroll reducido y
// reintento. Mockea `streamChat` y `next/navigation`.

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChatPage } from "../ChatPage";
import { streamChat, type ChatStreamChunk } from "@/lib/api/chat";

const navMocks = vi.hoisted(() => ({ searchParams: new URLSearchParams() }));

// Estado de preferencias controlable por test (feature 022).
const settingsState = vi.hoisted(() => ({
  language: "es",
  respondInInterfaceLanguage: true,
  useNotesForSearch: true,
  showHistory: true,
  reducedMotion: false,
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
    reducedMotion: settingsState.reducedMotion,
    restoreDefaults: vi.fn(),
  }),
}));

const mockedStreamChat = vi.mocked(streamChat);

/** Generador que emite una respuesta simple y termina. */
function simpleStream(
  chunks: string[],
  done = true,
): () => AsyncGenerator<ChatStreamChunk> {
  return async function* () {
    for (const c of chunks) yield { chunk: c, done: false };
    if (done) yield { chunk: "", done: true };
  };
}

/** Generador que emite un token y queda a la espera del abort (o para siempre). */
function hangingStream(token: string) {
  return async function* (_payload: unknown, signal?: AbortSignal) {
    yield { chunk: token, done: false };
    await new Promise<void>((_, reject) => {
      if (signal) {
        signal.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      }
    });
  };
}

beforeEach(() => {
  sessionStorage.clear();
  navMocks.searchParams = new URLSearchParams();
  mockedStreamChat.mockReset();
  settingsState.language = "es";
  settingsState.respondInInterfaceLanguage = true;
  settingsState.useNotesForSearch = true;
  settingsState.showHistory = true;
  settingsState.reducedMotion = false;
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
    mockedStreamChat.mockImplementation(simpleStream(["Hola", " mundo"]));

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

  it("muestra el error con título cuando el stream emite un evento de error", async () => {
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
    expect(screen.getByText("Error del chat")).toBeInTheDocument();
  });

  it("persiste el historial en sessionStorage con forma { role, content }", async () => {
    const user = userEvent.setup();
    mockedStreamChat.mockImplementation(simpleStream(["respuesta"]));

    render(<ChatPage />);

    await user.type(screen.getByLabelText("Mensaje"), "hola");
    await user.click(screen.getByLabelText("Enviar mensaje"));
    await screen.findByText("respuesta");

    await waitFor(() => {
      const history = JSON.parse(
        sessionStorage.getItem("chat_history") ?? "[]",
      );
      expect(history).toEqual([
        { role: "user", content: "hola" },
        { role: "assistant", content: "respuesta" },
      ]);
    });
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
    mockedStreamChat.mockImplementation(simpleStream([], true));

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
    mockedStreamChat.mockImplementation(simpleStream([], true));

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
    mockedStreamChat.mockImplementation(simpleStream([], true));

    render(<ChatPage />);

    await user.type(screen.getByLabelText("Mensaje"), "hola");
    await user.click(screen.getByLabelText("Enviar mensaje"));

    await waitFor(() => expect(mockedStreamChat).toHaveBeenCalledTimes(1));
    const payload = mockedStreamChat.mock.calls[0][0];
    expect(payload.useNotes).toBe(false);
  });

  it("no persiste en cada token: debounce + flush (Z4-01)", async () => {
    const user = userEvent.setup();
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");

    let tokenCount = 0;
    mockedStreamChat.mockImplementation(async function* () {
      for (let i = 0; i < 30; i += 1) {
        tokenCount += 1;
        yield { chunk: "x", done: false };
      }
      yield { chunk: "", done: true };
    });

    render(<ChatPage />);

    await user.type(screen.getByLabelText("Mensaje"), "hola");
    await user.click(screen.getByLabelText("Enviar mensaje"));

    // Espera a que termine el streaming (el botón Detener desaparece).
    await waitFor(() =>
      expect(screen.queryByLabelText("Detener")).not.toBeInTheDocument(),
    );

    const historyWrites = setItemSpy.mock.calls.filter(
      ([key]) => key === "chat_history",
    );
    // Nunca una escritura por token: el debounce colapsa y el flush finaliza.
    expect(historyWrites.length).toBeLessThan(tokenCount);
    expect(historyWrites.length).toBeLessThan(10);

    setItemSpy.mockRestore();
  });

  it("usa ids estables como key y los expone en el DOM (Z4-05)", async () => {
    const user = userEvent.setup();
    mockedStreamChat.mockImplementation(simpleStream(["resp"]));

    const { container } = render(<ChatPage />);

    await user.type(screen.getByLabelText("Mensaje"), "hola");
    await user.click(screen.getByLabelText("Enviar mensaje"));
    await screen.findByText("resp");

    const ids = Array.from(container.querySelectorAll("[data-message-id]")).map(
      (el) => el.getAttribute("data-message-id"),
    );
    expect(ids).toHaveLength(2);
    expect(ids.every((id) => typeof id === "string" && id.length > 0)).toBe(
      true,
    );
    expect(new Set(ids).size).toBe(2);
  });

  it("expone aria-live=polite en el contenedor y role=status al pensar (Z4-04)", async () => {
    const user = userEvent.setup();
    mockedStreamChat.mockImplementation(hangingStream("hola"));

    render(<ChatPage />);

    expect(screen.getByTestId("chat-messages")).toHaveAttribute(
      "aria-live",
      "polite",
    );

    await user.type(screen.getByLabelText("Mensaje"), "hola");
    await user.click(screen.getByLabelText("Enviar mensaje"));

    const thinking = await screen.findByTestId("chat-thinking");
    expect(thinking).toHaveAttribute("role", "status");
  });

  it("muestra Detener durante el streaming y conserva el texto parcial al abortar (Z4-06)", async () => {
    const user = userEvent.setup();
    mockedStreamChat.mockImplementation(hangingStream("parcial"));

    render(<ChatPage />);

    await user.type(screen.getByLabelText("Mensaje"), "hola");
    await user.click(screen.getByLabelText("Enviar mensaje"));
    await screen.findByText("parcial");

    const stop = screen.getByRole("button", { name: "Detener" });
    expect(stop).toBeInTheDocument();
    await user.click(stop);

    // Al abortar termina el streaming sin mostrar error y conserva el parcial.
    await waitFor(() =>
      expect(screen.queryByLabelText("Detener")).not.toBeInTheDocument(),
    );
    expect(screen.queryByTestId("chat-error")).not.toBeInTheDocument();
    expect(screen.getByText("parcial")).toBeInTheDocument();

    await waitFor(() => {
      const history = JSON.parse(
        sessionStorage.getItem("chat_history") ?? "[]",
      );
      expect(history[history.length - 1]).toEqual({
        role: "assistant",
        content: "parcial",
      });
    });
  });

  it("aborta el stream al desmontar (Z4-03)", async () => {
    const user = userEvent.setup();
    mockedStreamChat.mockImplementation(hangingStream("parcial"));

    const { unmount } = render(<ChatPage />);

    await user.type(screen.getByLabelText("Mensaje"), "hola");
    await user.click(screen.getByLabelText("Enviar mensaje"));
    await screen.findByText("parcial");

    const signal = mockedStreamChat.mock.calls[0][1] as AbortSignal | undefined;
    expect(signal).toBeDefined();

    unmount();

    expect(signal?.aborted).toBe(true);
  });

  it("reintenta el último mensaje desde el error (Z4-08)", async () => {
    const user = userEvent.setup();
    mockedStreamChat
      .mockImplementationOnce(async function* () {
        yield { error: "fallo", done: true };
      })
      .mockImplementationOnce(simpleStream(["ok"]));

    render(<ChatPage />);

    await user.type(screen.getByLabelText("Mensaje"), "hola");
    await user.click(screen.getByLabelText("Enviar mensaje"));
    await screen.findByTestId("chat-error");

    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    await screen.findByText("ok");

    expect(mockedStreamChat).toHaveBeenCalledTimes(2);
    expect(mockedStreamChat.mock.calls[1][0].query).toBe("hola");
  });

  it("hace auto-scroll suave cuando prefers-reduced-motion no está activo (Z4-09)", async () => {
    const user = userEvent.setup();
    const scrollTo = vi.fn();
    Element.prototype.scrollTo =
      scrollTo as unknown as typeof Element.prototype.scrollTo;
    mockedStreamChat.mockImplementation(simpleStream(["hola"]));

    render(<ChatPage />);

    await user.type(screen.getByLabelText("Mensaje"), "x");
    await user.click(screen.getByLabelText("Enviar mensaje"));
    await screen.findByText("hola");

    const smoothCalls = scrollTo.mock.calls.filter(
      ([opts]) => opts?.behavior === "smooth",
    );
    expect(smoothCalls.length).toBeGreaterThan(0);
  });

  it("hace scroll instantáneo cuando prefers-reduced-motion está activo (Z4-09)", async () => {
    settingsState.reducedMotion = true;
    const user = userEvent.setup();
    const scrollTo = vi.fn();
    Element.prototype.scrollTo =
      scrollTo as unknown as typeof Element.prototype.scrollTo;
    mockedStreamChat.mockImplementation(simpleStream(["hola"]));

    render(<ChatPage />);

    await user.type(screen.getByLabelText("Mensaje"), "x");
    await user.click(screen.getByLabelText("Enviar mensaje"));
    await screen.findByText("hola");

    const smoothCalls = scrollTo.mock.calls.filter(
      ([opts]) => opts?.behavior === "smooth",
    );
    expect(smoothCalls.length).toBe(0);
  });
});
