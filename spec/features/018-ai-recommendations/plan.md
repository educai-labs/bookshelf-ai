# 018 · AI Recommendations — Plan

## Enfoque

Implementar la feature como una extensión del router `ai` existente: un servicio
aislado cargará en como máximo dos consultas los libros `read`/`reading` y sus
notas raíz, construirá un prompt con ejemplos de salida JSON y ejecutará el
modelo Gemini configurable con structured output. La respuesta se validará con
Pydantic y se servirá mediante una caché en memoria de 24 horas por usuario,
manteniendo el `user_id` derivado exclusivamente del JWT.

En el frontend se añadirá una página protegida dentro del route group del
dashboard, un cliente API autenticado y una entrada de navegación. La página
reutilizará los componentes shadcn existentes, los diccionarios i18n y el
patrón de estados del dashboard, sin modificar componentes compartidos ni
añadir dependencias.

## Implementación

1. Definir `RecommendationItem` y `RecommendationResponse` con Pydantic v2 en
   `apps/api/app/models/recommendations.py`, incluyendo `authors` no vacío,
   `reason` y `confidence` acotado entre 0 y 1; exponer un esquema compatible
   con `response_schema` de Gemini.
2. Implementar el servicio en
   `apps/api/app/services/recommendations.py`: cargar libros propios con
   `status in ('read', 'reading')`, cargar en una segunda consulta solo
   `book_notes` de esos libros con `chunk_index=0`, extraer títulos, autores,
   ratings y temas/keywords de las notas mediante heurística ligera, y construir
   un prompt determinista con few-shot examples que exija únicamente JSON.
3. En el mismo servicio, configurar Gemini con
   `settings.gemini_chat_model` y `generation_config` con
   `response_mime_type: application/json` y `response_schema` de
   `RecommendationResponse`; ejecutar la llamada síncrona fuera del event loop,
   parsear y validar la respuesta, y devolver lista vacía con log estructurado
   ante JSON inválido, respuesta inválida o ausencia de historial útil.
4. Añadir una caché acotada tipo `TTLCache` en
   `apps/api/app/services/recommendations.py`, indexada por `user_id` (y
   limitada a 24 horas), sin persistir recomendaciones en PostgreSQL. Si el
   proyecto no incorpora una implementación equivalente, usar una pequeña
   implementación estándar local en vez de introducir una dependencia de
   runtime no necesaria.
5. Añadir en `apps/api/app/api/v1/endpoints/ai.py` el endpoint autenticado
   `GET /api/v1/ai/recommendations`, con `limit` por query (default 5, rango
   1–10), dependencia `get_current_user`, propagación segura de errores de
   Supabase/Gemini y respuesta `RecommendationResponse`; conservar intacto el
   contrato SSE de `/ai/chat`.
6. Crear tests backend colocalizados en
   `apps/api/app/services/test_recommendations.py` y
   `apps/api/app/api/v1/endpoints/test_ai_recommendations.py`: mockear `genai`
   y Supabase, comprobar las consultas/aislamiento por usuario, presencia de
   datos del usuario en el prompt y few-shot JSON, validación de JSON válido,
   fallback vacío con log, límites de `limit` y cache hit sin segunda llamada
   al modelo/DB.
7. Crear el contrato y cliente autenticado en
   `apps/web/src/lib/api/recommendations.ts`, obteniendo el access token de
   Supabase, llamando `GET /api/v1/ai/recommendations?limit=5`, validando la
   respuesta con el mecanismo Zod existente y convirtiendo respuestas 401/5xx
   en el error API ya utilizado por el frontend.
8. Crear la página protegida
   `apps/web/src/app/(dashboard)/recommendations/page.tsx` y el componente
   cliente `apps/web/src/components/recommendations/RecommendationsPage.tsx`.
   Renderizar título, grid responsive de cards, autores, razón y badge de
   confidence usando `Card`, `Badge`, `Skeleton` y `Button` existentes; cubrir
   carga visible, vacío explicativo, error con botón `Reintentar` y nueva
   petición sin recarga. Añadir `role="grid"`, roles de card/badge apropiados,
   `aria-live` para estados, foco visible y orden de teclado lógico.
9. Añadir el enlace `/recommendations` y su estado activo en
   `apps/web/src/components/layout/Sidebar.tsx`, reutilizando un icono
   existente y sin romper el drawer móvil; añadir todas las claves necesarias
   (título, navegación, cards, confidence, carga, vacío, error, reintento) en
   español e inglés en `apps/web/src/lib/i18n/dictionaries.ts`.
10. Añadir tests frontend junto a los módulos: cliente/mock API en
    `apps/web/src/lib/api/recommendations.test.ts` y página en
    `apps/web/src/components/recommendations/RecommendationsPage.test.tsx`;
    cubrir datos renderizados, carga, vacío, error/reintento, respuesta 401/5xx,
    autenticación, navegación activa, i18n y ausencia de strings hardcodeados.
11. Ejecutar las validaciones definidas por la constitución: `cd apps/api &&
    pytest -v`, `ruff check . && black --check .`, `docker build -t bookshelf-api
    .`; y `cd apps/web && npm run test`, `npm run lint`, `npm run build`.

## Decisiones

- **Servicio de recomendaciones separado del endpoint** — Mantiene `ai.py`
  delgado y permite probar carga de contexto, prompt, generación, validación y
  caché de forma aislada; no se reutiliza el flujo SSE porque esta respuesta es
  JSON completa y no requiere streaming.
- **Dos consultas Supabase y filtrado por JWT** — La primera obtiene libros
  propios en estados útiles y la segunda sus notas `chunk_index=0`, cumpliendo
  el límite de 1–2 queries sin SQL raw en frontend ni riesgo de datos de otro
  usuario; no se añade una migración ni persistencia de recomendaciones.
- **Gemini structured output más validación Pydantic** — Se usa el modelo de
  chat configurable y el esquema JSON para reducir parsing frágil, pero se
  conserva una validación local y fallback vacío para respuestas truncadas o
  incompatibles; no se implementa un parser heurístico de texto libre.
- **Caché TTL en memoria por usuario** — Las recomendaciones on-demand no
  cambian minuto a minuto y 24 horas reduce coste/latencia; se descarta Redis o
  una tabla nueva porque la spec exige TTLCache, no persistencia, y el
  despliegue scale-to-zero no necesita coordinación entre instancias para este
  MVP.
- **Página cliente dentro del route group `(dashboard)`** — Aprovecha la
  protección de sesión y el `SessionProvider` existentes, mientras el cliente
  API obtiene el JWT explícitamente; no se crea una ruta pública ni se expone
  `service_role` en el navegador.
- **Composición con primitivos existentes e i18n centralizado** — Se consumen
  `Card`, `Badge`, `Skeleton`, `Button`, Tailwind y `useTranslation`; no se
  modifican componentes compartidos, no se añaden dependencias frontend y no
  se hardcodean textos.

## Riesgos

- **Historial insuficiente o notas sin contenido** — El servicio devuelve una
  respuesta válida con `recommendations=[]`; la página lo presenta como estado
  vacío orientativo, no como error.
- **Gemini devuelve JSON inválido, incompleto o confidence fuera de rango** —
  `response_schema` y Pydantic validan el contrato; cualquier fallo produce
  fallback vacío, log estructurado sin secretos y una UI estable.
- **Coste, latencia o rate limits del modelo** — La caché por usuario de 24 h,
  el límite máximo de 10 y la llamada fuera del event loop reducen coste y
  evitan bloquear FastAPI; los tests verifican que un cache hit no regenera.
- **Fuga de libros/notas entre usuarios** — Todas las consultas reciben el
  `user_id` de `get_current_user` y filtran ownership; los tests mockeados
  verifican que nunca se usa un identificador proporcionado por el cliente.
- **Sesión ausente o fallo HTTP 401/5xx** — El cliente reutiliza el patrón de
  headers y `ApiError`, y la página muestra error traducido con `Reintentar`
  que repite la llamada sin navegación.
- **Regresiones responsive, de accesibilidad o de i18n** — Se prueban estados y
  navegación, se usan roles/`aria-live` y breakpoints Tailwind del dashboard
  (1/2/3/4 columnas); se ejecutan lint, tests y build de producción.
