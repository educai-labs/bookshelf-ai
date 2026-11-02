# 018 · AI Recommendations

**Estado:** hecho

## Qué hace

Genera recomendaciones de libros personalizadas basadas en el historial del usuario y las muestra dentro de la app. Dos partes, ambas en el alcance de la feature:

- **Backend**: endpoint `GET /api/v1/ai/recommendations` que genera 5 recomendaciones de libros personalizadas basadas en el historial del usuario.
- **Frontend**: página `/recommendations`, accesible desde el sidebar del dashboard, que muestra las recomendaciones en un grid de cards (título, autores, razón y badge de confidence), con estados de carga, vacío y error con reintento. Se construye reutilizando los primitivos de UI ya usados por el dashboard, sin dependencias nuevas y sin modificar los componentes compartidos.

Input: `limit` (query, default 5, max 10).
Proceso:
1. Fetch libros del usuario (`status = 'read'` o `'reading'`) + sus notas (chunks `chunk_index=0`).
2. Extrae: títulos, autores, ratings, temas/keywords (LLM call ligero o heurística: top entidades en notas).
3. Construye prompt para el modelo de chat configurable (default `gemini-3.5-flash`, structured output / JSON mode): "Basado en esta biblioteca: [LISTA LIBROS + RATINGS + TEMAS], sugiere 5 libros que le gustarían. Para cada uno: título, autores, razón (1-2 frases), confidence 0-1. Responde SOLO JSON válido."
4. Parse JSON → `RecommendationResponse { recommendations: RecommendationItem[] }`.

Output: array de `{ title, authors[], reason, confidence }`.

## Por qué

Recomendaciones añaden valor "descubrimiento" sin esfuerzo manual. Usar historial real (ratings + notas) > filtros genéricos. Structured output JSON evita parsing frágil. La página `/recommendations` es parte del alcance porque el valor de la feature solo llega al usuario si puede ver las recomendaciones dentro de la app; un endpoint sin UI sería infrautilizable. La feature sigue priorizada en el Backlog del roadmap porque requiere historial mínimo para ser útil (el MVP prioriza chat), pero eso no reduce su alcance: cuando empiece, backend y página se entregan juntos.

## Criterios de aceptación

- [ ] Endpoint `GET /api/v1/ai/recommendations` en `ai.py`, auth required.
- [ ] Fetch eficiente: `books` (read/reading) + `book_notes` (chunk_index=0) en 1-2 queries.
- [ ] Prompt template con few-shot examples para JSON válido.
- [ ] `generation_config = { "response_mime_type": "application/json", "response_schema": RecommendationResponseSchema }` (Gemini structured output).
- [ ] Validación response: `RecommendationResponse` model; si parse falla → fallback vacío + log error.
- [ ] Cache: 24h por usuario (TTLCache) — recomendaciones no cambian minuto a minuto.
- [ ] Tests: mock `genai` + DB; verifica prompt incluye datos usuario, JSON válido, cache hit.

Frontend (página `/recommendations`, en alcance):

- [ ] Página `/recommendations` routeada y usable en producción (no solo local/dev), consumiendo `GET /api/v1/ai/recommendations` con la autenticación de sesión del usuario.
- [ ] Entrada de navegación hacia `/recommendations` en el sidebar del dashboard, con estado activo visible al estar en la página.
- [ ] Grid de cards donde cada card muestra: título, autores, razón (1–2 frases) y badge de confidence (valor 0–1 del endpoint).
- [ ] Estado de carga visible mientras se obtienen las recomendaciones (la UI no queda en blanco).
- [ ] Estado vacío cuando no hay recomendaciones (p. ej. historial insuficiente o fallback vacío del endpoint): mensaje explicando que se necesitan más libros/notas, sin mostrar un error.
- [ ] Estado de error si la API falla (incl. 401/5xx), con botón "Reintentar" que vuelve a llamar al endpoint sin necesidad de recargar ni navegar.
- [ ] i18n completo en español e inglés: todos los textos de la página, sidebar, badges y estados provienen de los diccionarios; cero strings hardcodeados en los componentes.
- [ ] Responsive: el grid se adapta de móvil (1 columna) a escritorio (múltiples columnas) sin desbordes ni solapes.
- [ ] Accesible: roles/aria correctos en grid, cards, badge y estados (`role`/`aria-live` donde aplique); navegación completa por teclado con orden de tab lógico y foco visible.
- [ ] Tests de frontend: (a) componente/página renderiza título, autores, razón y badge con datos simulados del endpoint, y cubre estados de carga, vacío y error con reintento; (b) cliente de API contra `GET /api/v1/ai/recommendations` con fetch/endpoint mock, incluyendo respuesta de error.
- [ ] Sin dependencias frontend nuevas; la página reutiliza los primitivos/componentes ya usados por el dashboard sin modificarlos (solo consumo, no cambios a componentes compartidos).

## Fuera de alcance

- Recomendaciones basadas en "libros similares a X" (item-based) — solo user-based para MVP.
- Integración con catálogos externos (Open Library, Google Books) para enlazar portada/comprar — aplica también a la página `/recommendations`: las cards muestran solo los datos que devuelve el endpoint.
- Feedback explícito (like/dislike recomendación) → re-entrenamiento.
- Explicabilidad avanzada (qué notas específicas dispararon la recomendación).
- Persistencia de recomendaciones en DB o generación por lotes/offline — las recomendaciones se calculan on-demand con caché de 24 h por usuario en el backend.
- Red social, reseñas públicas o gamificación en torno a las recomendaciones (qué NO es en `mission.md`).