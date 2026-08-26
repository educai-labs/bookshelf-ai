// Tests del cliente de chat (feature 017): parser SSE y consumo incremental
// del `ReadableStream` con mocks de `fetch` y `ReadableStream`.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { supabase } from "@/lib/supabase/client";
import { parseSseEvent, streamChat, type ChatStreamChunk } from "./chat";

function sseResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function mockSession() {
  vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
    data: { session: { access_token: "test-token" } },
    error: null,
  } as never);
}

beforeEach(() => {
  mockSession();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Parser SSE
// ---------------------------------------------------------------------------

describe("parseSseEvent", () => {
  it("parsea un chunk", () => {
    expect(parseSseEvent('data: {"chunk":"Hola","done":false}')).toEqual({
      chunk: "Hola",
      done: false,
    });
  });

  it("parsea el evento final done", () => {
    expect(parseSseEvent('data: {"chunk":"","done":true}')).toEqual({
      chunk: "",
      done: true,
    });
  });

  it("parsea un evento de error", () => {
    expect(parseSseEvent('data: {"error":"boom","done":true}')).toEqual({
      error: "boom",
      done: true,
    });
  });

  it("soporta el centinela [DONE]", () => {
    expect(parseSseEvent("data: [DONE]")).toEqual({ done: true });
  });

  it("ignora líneas sin data:", () => {
    expect(
      parseSseEvent('event: message\ndata: {"chunk":"x","done":false}'),
    ).toEqual({
      chunk: "x",
      done: false,
    });
  });

  it("devuelve null para JSON inválido", () => {
    expect(parseSseEvent("data: {no-json")).toBeNull();
  });

  it("devuelve null para eventos sin data", () => {
    expect(parseSseEvent("")).toBeNull();
    expect(parseSseEvent(": comentario")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// streamChat
// ---------------------------------------------------------------------------

describe("streamChat", () => {
  it("consume el stream y devuelve chunks y evento final", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          sseResponse([
            'data: {"chunk":"Hola","done":false}\n\n',
            'data: {"chunk":" mundo","done":false}\n\n',
            'data: {"chunk":"","done":true}\n\n',
          ]),
        ),
    );

    const chunks: ChatStreamChunk[] = [];
    for await (const chunk of streamChat({ query: "hola" })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      { chunk: "Hola", done: false },
      { chunk: " mundo", done: false },
      { chunk: "", done: true },
    ]);
  });

  it("tolera eventos partidos entre lecturas (buffer hasta \\n\\n)", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          sseResponse([
            'data: {"chunk":"Hol',
            'a","done":false}\n\n',
            'data: {"chunk":"","done":true}\n\n',
          ]),
        ),
    );

    const chunks: ChatStreamChunk[] = [];
    for await (const chunk of streamChat({ query: "hola" })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      { chunk: "Hola", done: false },
      { chunk: "", done: true },
    ]);
  });

  it("envía el token JWT y el cuerpo snake_case", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(sseResponse(['data: {"chunk":"ok","done":true}\n\n']));
    vi.stubGlobal("fetch", fetchMock);

    for await (const _chunk of streamChat({
      query: "hola",
      bookId: "book-123",
      mode: "book",
    })) {
      // consume
    }

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/ai/chat");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer test-token");
    expect(JSON.parse(init.body)).toEqual({
      query: "hola",
      book_id: "book-123",
      mode: "book",
    });
  });

  it("lanza error amigable cuando falta GEMINI_API_KEY", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: "GEMINI_KEY_MISSING",
            message: "sin clave",
          }),
          {
            status: 503,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );

    await expect(async () => {
      for await (const _chunk of streamChat({ query: "hola" })) {
        // noop
      }
    }).rejects.toThrow("El chat no está configurado");
  });
});
