# 018 · AI Recommendations

**Estado:** propuesta

## Qué hace

Expone `GET /api/v1/ai/recommendations` que genera 5 recomendaciones de libros personalizadas basadas en el historial del usuario.

Input: `limit` (query, default 5, max 10).
Proceso:
1. Fetch libros del usuario (`status = 'read'` o `'reading'`) + sus notas (chunks `chunk_index=0`).
2. Extrae: títulos, autores, ratings, temas/keywords (LLM call ligero o heurística: top entidades en notas).
3. Construye prompt para `gemini-2.0-flash` (structured output / JSON mode): "Basado en esta biblioteca: [LISTA LIBROS + RATINGS + TEMAS], sugiere 5 libros que le gustarían. Para cada uno: título, autores, razón (1-2 frases), confidence 0-1. Responde SOLO JSON válido."
4. Parse JSON → `RecommendationResponse { recommendations: RecommendationItem[] }`.

Output: array de `{ title, authors[], reason, confidence }`.

## Por qué

Recomendaciones añaden valor "descubrimiento" sin esfuerzo manual. Usar historial real (ratings + notas) > filtros genéricos. Structured output JSON evita parsing frágil. Feature en Backlog porque requiere historial mínimo para ser útil (MVP prioriza chat).

## Criterios de aceptación

- [ ] Endpoint `GET /api/v1/ai/recommendations` en `ai.py`, auth required.
- [ ] Fetch eficiente: `books` (read/reading) + `book_notes` (chunk_index=0) en 1-2 queries.
- [ ] Prompt template con few-shot examples para JSON válido.
- [ ] `generation_config = { "response_mime_type": "application/json", "response_schema": RecommendationResponseSchema }` (Gemini structured output).
- [ ] Validación response: `RecommendationResponse` model; si parse falla → fallback vacío + log error.
- [ ] Cache: 24h por usuario (TTLCache) — recomendaciones no cambian minuto a minuto.
- [ ] Tests: mock `genai` + DB; verifica prompt incluye datos usuario, JSON válido, cache hit.
- [ ] Frontend: página `/recommendations` (Backlog) — grid de cards con razón + confidence badge.

## Fuera de alcance

- Recomendaciones basadas en "libros similares a X" (item-based) — solo user-based para MVP.
- Integración con catálogos externos (Open Library, Google Books) para enlazar portada/comprar.
- Feedback explícito (like/dislike recomendación) → re-entrenamiento.
- Explicabilidad avanzada (qué notas específicas dispararon la recomendación).