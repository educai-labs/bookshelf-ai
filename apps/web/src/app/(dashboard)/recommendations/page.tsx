import type { Metadata } from "next";

import { RecommendationsPage } from "@/components/recommendations/RecommendationsPage";

export const metadata: Metadata = {
  title: "Recomendaciones | Bookshelf",
};

/**
 * Ruta `/recommendations` (feature 018), dentro del route group protegido
 * `(dashboard)`. El layout verifica la sesión en el servidor y el componente
 * cliente consume `GET /api/v1/ai/recommendations` con la sesión del usuario.
 */
export default function RecommendationsRoute() {
  return <RecommendationsPage />;
}
