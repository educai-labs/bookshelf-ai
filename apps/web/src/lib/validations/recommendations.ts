// Esquemas Zod de la respuesta de recomendaciones (feature 018).
//
// Validación en el cliente de la forma recibida de
// `GET /api/v1/ai/recommendations` (convención `tech-stack.md`: Zod en frontend
// para respuestas API). Los campos deben coincidir con
// `apps/api/app/models/recommendations.py`.

import { z } from "zod";

/** Una recomendación (espejo de `RecommendationItem`). */
export const recommendationItemSchema = z.object({
  title: z.string().min(1),
  authors: z.array(z.string()).min(1),
  reason: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

/** Respuesta de `GET /api/v1/ai/recommendations`. */
export const recommendationsResponseSchema = z.object({
  recommendations: z.array(recommendationItemSchema),
});

export type RecommendationItem = z.infer<typeof recommendationItemSchema>;
export type RecommendationsResponse = z.infer<
  typeof recommendationsResponseSchema
>;
