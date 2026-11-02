// Cliente API de recomendaciones (feature 018).
//
// `GET /api/v1/ai/recommendations?limit=5` autenticado con el access token de
// la sesión Supabase. Valida la respuesta con el esquema Zod y convierte los
// errores HTTP (401/5xx) en `ApiError` (mismo contrato de error que el resto
// del frontend). Sin dependencias nuevas.

import { ApiError } from "@/lib/api/books";
import { supabase } from "@/lib/supabase/client";
import {
  recommendationsResponseSchema,
  type RecommendationsResponse,
} from "@/lib/validations/recommendations";

export type {
  RecommendationsResponse,
  RecommendationItem,
} from "@/lib/validations/recommendations";

/** Headers comunes con el token de acceso de la sesión Supabase. */
async function authHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};
}

/**
 * `GET /api/v1/ai/recommendations?limit=...`
 * Obtiene las recomendaciones personalizadas del usuario autenticado.
 *
 * Lanza `ApiError` (con `code`/`status`) ante cualquier respuesta no 2xx o ante
 * una respuesta que no cumple el contrato Zod. El `code` se propaga intacto
 * para que la UI traduzca por código (sin literales hardcodeados aquí).
 */
export async function getRecommendations(
  limit = 5,
): Promise<RecommendationsResponse> {
  const headers = await authHeaders();
  const res = await fetch(`/api/v1/ai/recommendations?limit=${limit}`, {
    headers,
  });

  if (!res.ok) {
    const errorData = (await res.json().catch(() => ({}))) as {
      code?: string;
      message?: string;
    };
    const code = errorData.code ?? "RECOMMENDATIONS_FAILED";
    throw new ApiError(res.status, code, errorData.message ?? code);
  }

  const parsed = recommendationsResponseSchema.safeParse(await res.json());
  if (!parsed.success) {
    throw new ApiError(
      res.status,
      "INVALID_RECOMMENDATIONS_RESPONSE",
      "INVALID_RECOMMENDATIONS_RESPONSE",
    );
  }
  return parsed.data;
}
