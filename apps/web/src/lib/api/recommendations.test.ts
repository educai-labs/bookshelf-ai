// Tests del cliente de recomendaciones (feature 018): llamada autenticada a
// `GET /api/v1/ai/recommendations`, validación Zod de la respuesta y conversión
// de errores 401/5xx a `ApiError`.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { supabase } from "@/lib/supabase/client";
import { getRecommendations } from "./recommendations";

function mockSession() {
  vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
    data: { session: { access_token: "test-token" } },
    error: null,
  } as never);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const VALID_BODY = {
  recommendations: [
    {
      title: "El nombre del viento",
      authors: ["Patrick Rothfuss"],
      reason: "Por su mundo rico.",
      confidence: 0.87,
    },
  ],
};

beforeEach(() => {
  mockSession();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("getRecommendations", () => {
  it("llama al endpoint con limit y devuelve la respuesta validada", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(VALID_BODY));
    vi.stubGlobal("fetch", fetchMock);

    const data = await getRecommendations(5);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/ai/recommendations?limit=5");
    expect(init.headers.Authorization).toBe("Bearer test-token");
    expect(data.recommendations).toHaveLength(1);
    expect(data.recommendations[0].title).toBe("El nombre del viento");
  });

  it("usa limit=5 por defecto", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(VALID_BODY));
    vi.stubGlobal("fetch", fetchMock);

    await getRecommendations();

    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/v1/ai/recommendations?limit=5",
    );
  });

  it("convierte un 401 en ApiError con el código del backend", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ code: "NOT_AUTHENTICATED", message: "no auth" }, 401),
        ),
    );

    await expect(getRecommendations()).rejects.toMatchObject({
      status: 401,
      code: "NOT_AUTHENTICATED",
    });
  });

  it("convierte un 5xx sin código en ApiError RECOMMENDATIONS_FAILED", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ message: "boom" }, 500)),
    );

    await expect(getRecommendations()).rejects.toMatchObject({
      status: 500,
      code: "RECOMMENDATIONS_FAILED",
    });
  });

  it("rechaza una respuesta que no cumple el contrato Zod", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(jsonResponse({ recommendations: [{ title: "x" }] })),
    );

    await expect(getRecommendations()).rejects.toMatchObject({
      code: "INVALID_RECOMMENDATIONS_RESPONSE",
    });
  });
});
