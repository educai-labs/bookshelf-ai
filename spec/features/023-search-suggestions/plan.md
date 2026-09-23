# 023 · Search Suggestions (Typeahead) — Plan de implementación

## Enfoque

Extender la búsqueda existente con un contrato único de sugerencias y un
componente de combobox reutilizable en el frontend. El backend expondrá
`GET /api/v1/books/suggestions`, combinando primero los libros del usuario con
resultados de catálogo obtenidos por un nuevo método de búsqueda textual del
`ISBNLookupService`. La consulta de biblioteca se hará siempre con el
`user_id` derivado del JWT; la consulta externa solo se realizará para entradas
de tres o más caracteres.

En el frontend, `SearchInput` y `AddBookModal` consumirán un hook compartido
con debounce de 300 ms, cancelación de respuestas obsoletas y estados de
combobox accesibles. La selección conservará los flujos existentes: una
sugerencia de biblioteca navega a la ficha, una de catálogo abre el modal con
el ISBN, y Enter sin selección mantiene el filtro `q` del grid. Se reutilizarán
los tipos, cliente API, `useDebounce`, `AddBookModal`, shadcn/ui e i18n de las
features 013, 014 y 022, sin añadir dependencias ni modificar migraciones.

## Implementación

### Backend

1. Definir los contratos Pydantic de la respuesta de sugerencias y de sus
   fuentes en `apps/api/app/models/suggestions.py`. Incluir `source`,
   `book_id`, `isbn13`, `title`, `authors`, `cover_url` e `in_library`, con
   `book_id` nullable para catálogo y validación de `limit` entre 1 y 20.
2. Extender `apps/api/app/services/isbn_lookup.py` con una operación de
   búsqueda textual separada de `buscar(isbn)`. Implementar mapeadores de
   Open Library y Google Books que normalicen cada resultado y descarten los
   que no permitan resolver un ISBN-13. Usar caché en memoria por consulta
   normalizada y TTL de una hora; esta operación tendrá timeout de 2 segundos
   y ningún reintento, sin alterar el contrato de lookup ISBN existente de la
   feature 008.
3. Añadir la lógica de merge/deduplicación en un servicio o módulo de dominio
   de sugerencias, por ejemplo `apps/api/app/services/book_suggestions.py`.
   Consultar la biblioteca del usuario por título e ISBN con `ilike` y filtrar
   autores de forma compatible con el acceso actual a `text[]`; ordenar
   biblioteca antes que catálogo, eliminar ISBN13 repetidos conservando la
   entrada de biblioteca y truncar al `limit` solicitado. Con menos de tres
   caracteres no invocar el servicio externo.
4. Crear el endpoint autenticado `GET /api/v1/books/suggestions` en
   `apps/api/app/api/v1/endpoints/suggestions.py` y registrarlo en
   `apps/api/app/api/v1/router.py` (o el módulo de registro vigente). Recibir
   `q` obligatorio y `limit=8`, aplicar `trim`, devolver 422 para ausente o
   vacío y delegar el `user_id` a `Depends(get_current_user)`. Mapear errores
   de validación al formato `{code, message, field?}`; los errores o timeout de
   ambas fuentes externas deben registrarse y convertirse en 200 con solo
   biblioteca, nunca en error duro.
5. Reutilizar el cliente Supabase y los filtros de `books` sin aceptar
   `user_id` del cliente. La respuesta de biblioteca debe incluir únicamente
   filas del usuario autenticado, aun cuando el cliente de la base de datos
   utilizado por el backend tenga privilegios elevados.
6. Añadir tests junto a los módulos siguiendo las convenciones existentes:
   `apps/api/app/services/test_book_suggestions.py` y
   `apps/api/app/api/v1/test_suggestions.py`. Cubrir 401, validación de `q` y
   `limit`, título/autor/ISBN, aislamiento entre usuarios, umbral sin HTTP,
   fallback y fail-soft externo, timeout sin reintentos, caché, deduplicación,
   prioridad, orden y límite.

### Frontend

7. Añadir los tipos `SuggestionSource`, `BookSuggestion` y la respuesta de
   sugerencias en `apps/web/src/types/book.ts` (o un módulo de tipos dedicado)
   y una función autenticada `getBookSuggestions` en
   `apps/web/src/lib/api/books.ts`. Validar la forma recibida con el mecanismo
   Zod ya adoptado por la aplicación y convertir errores a `ApiError`.
8. Crear `apps/web/src/lib/hooks/useBookSuggestions.ts` para centralizar el
   valor debounced, el umbral de tres caracteres, `AbortController`, loading,
   vacío y error. No efectuar fetch para entradas vacías o menores de tres
   caracteres; ignorar respuestas de consultas anteriores y limitar la
   petición a ocho elementos para los dropdowns. El error será recuperable por
   la UI sin impedir el uso del filtro del grid.
9. Crear componentes reutilizables bajo `apps/web/src/components/search/`,
   por ejemplo `SuggestionsDropdown.tsx` y `BookSearchCombobox.tsx`. Implementar
   `role="combobox"`, `aria-expanded`, `aria-activedescendant`, opciones con
   `role="option"`, foco visible, ↑/↓, Enter y Escape. Renderizar loading,
   mensaje vacío, portadas con `alt` y placeholder, badge traducido de
   biblioteca y layout scrollable de ancho completo en viewport menor de
   640px.
10. Integrar el combobox en
    `apps/web/src/components/dashboard/SearchInput.tsx` y
    `apps/web/src/components/dashboard/LibraryGrid.tsx`. Mantener separado el
    texto inmediato del input y el `q` debounced del filtro. Al seleccionar una
    sugerencia de biblioteca usar `router.push('/book/[id]')`; al seleccionar
    catálogo abrir `AddBookModal` con el ISBN; al pulsar Enter sin selección
    propagar el texto al filtro actual. Si falla la API de sugerencias, mostrar
    toast no bloqueante y no romper la búsqueda del grid.
11. Adaptar `apps/web/src/components/books/AddBookModal.tsx` para aceptar una
    apertura/ISBN inicial controlables (manteniendo el uso actual con
    `DialogTrigger`). Al recibir un ISBN desde una sugerencia de catálogo,
    precargar el input y ejecutar el lookup existente para llegar a la preview;
    la entrada manual de ISBN13 conservará normalización, detección y manejo
    de errores de 014. Cuando corresponda, mostrar la coincidencia de
    biblioteca como "Ya en tu biblioteca" y deshabilitar el guardado antes de
    provocar un 409.
12. Conectar la apertura controlada desde el dashboard sin duplicar el modal,
    probablemente mediante estado levantado en `LibraryGrid`/`DashboardHeader`
    y props de `AddBookModal`. Asegurar que Escape cierre primero el dropdown y
    solo después el Dialog, usando el estado de apertura del combobox.
13. Añadir todas las claves nuevas de dropdown, estados, badge, error y toast a
    `apps/web/src/lib/i18n/dictionaries.ts` y consumirlas mediante
    `useTranslation`; no introducir strings visibles hardcodeados.
14. Añadir pruebas Vitest + RTL junto a los módulos: hook (debounce, umbral,
    abort/cancelación y una petición por pausa), dropdown (roles y teclado),
    merge/dedup visual, selección dashboard (navegación/modal), loading/vacío/
    error, integración del modal, ISBN manual y comportamiento de Escape.
15. Ejecutar la validación del stack: `cd apps/api && pytest -v && ruff check .
    && black --check .`; `cd apps/web && npm run test && npm run lint && npm
    run build`.

## Decisiones

| Tema | Decisión | Justificación | Alternativas descartadas |
|------|----------|---------------|--------------------------|
| **Contrato de sugerencias** | Un endpoint autenticado `GET /api/v1/books/suggestions` con `source` explícito y forma normalizada | Permite que dashboard y modal compartan merge, caché y render sin acoplarse a esquemas externos | Dos endpoints separados → lógica duplicada y resultados inconsistentes |
| **Extensión de feature 008** | Añadir búsqueda textual al servicio existente, manteniendo `buscar(isbn)` sin cambios de comportamiento | Reutiliza Open Library, Google Books, mapeadores y caché, y conserva compatibilidad con 014 | Cliente externo independiente → duplicación de fallback y configuración |
| **Timeout externo** | 2 segundos y cero reintentos solo para typeahead | El typeahead es interactivo y debe ser fail-soft; los retries del lookup ISBN no deben bloquearlo | Reusar los retries de ISBN → latencia excesiva y más llamadas por tecla |
| **Fuente de datos de biblioteca** | Consulta autenticada filtrada por `user_id`; autores se comparan sobre el array cuando PostgREST no admite `ilike` directo | Garantiza privacidad y coincide con la implementación existente de 009 | Consulta global o aceptar `user_id` del cliente → fuga de datos |
| **Límite** | Backend clamp 1–20 con default 8; frontend solicita 8 | El contrato es flexible para futuros consumidores, mientras la UI cumple el máximo de ocho | Hardcodear ocho solo en backend → menos reutilización del endpoint |
| **Combobox compartido** | Hook y dropdown comunes; cada superficie decide la acción de selección | Centraliza accesibilidad, estados y debounce sin mezclar navegación con alta | Dos implementaciones independientes → divergencias de teclado/i18n |
| **Apertura del modal** | `AddBookModal` admite modo controlado e ISBN inicial, pero conserva `DialogTrigger` y flujo lookup existente | Permite que catálogo abra el modal sin romper los triggers de 014 ni duplicar preview/save | Crear un modal nuevo para sugerencias → duplicación y flujos divergentes |
| **Cache** | Cachear únicamente búsquedas externas por consulta normalizada durante una hora, en memoria por proceso | Sigue el patrón 008 y evita dependencias; biblioteca debe reflejar el estado actual del usuario | Redis o cachear respuestas autenticadas → fuera de alcance y riesgo de datos cruzados |

## Riesgos

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| **El servicio 008 no obtiene ISBN13 desde todos los resultados textuales** | Catálogo incompleto o selección imposible de guardar | Normalizar identificadores de Open Library/Google Books, descartar explícitamente resultados sin ISBN13 y cubrir fixtures de ambos proveedores |
| **Respuestas externas obsoletas sobrescriben una consulta posterior** | Sugerencias incorrectas al teclear rápido | `AbortController`, identificador de consulta y comprobación de la consulta activa antes de actualizar estado; test con respuestas fuera de orden |
| **El timeout del proveedor bloquea el input** | Typeahead lento y mala UX | Timeout estricto de 2 s, sin retries, loading localizado y fallback inmediato a biblioteca con logging estructurado |
| **RLS o filtros de usuario mal aplicados** | Exposición de libros de otro usuario | Derivar siempre `user_id` del JWT, filtrar en la query, probar usuario A/B y no aceptar identificadores de usuario en query params |
| **Deduplicación inconsistente por ISBN con espacios o formato distinto** | Entradas duplicadas o badge incorrecto | Normalizar ISBN13 antes del merge y usar la clave normalizada; tests de duplicados biblioteca/catálogo |
| **Cambios en `AddBookModal` rompen triggers o lookup manual** | Regresión en alta de libros | Mantener props backward-compatible, conservar `useIsbnInput` y tests de 014, y probar tanto apertura por trigger como controlada |
| **Escape y foco en Dialog/combobox se interfieren** | Modal se cierra accidentalmente o teclado queda atrapado | Priorizar cierre del dropdown en el handler, respetar el focus trap de shadcn/Radix y probar secuencias ↑/↓/Enter/Escape |
| **Textos o portadas incumplen accesibilidad/i18n** | Revisión 022 fallida, UI inconsistente | Claves es/en tipadas, test de strings no traducidos, roles ARIA, `alt` explícito y verificación responsive bajo 640px |
| **El cache en memoria crece con consultas únicas** | Uso creciente de memoria por proceso | TTL de una hora con limpieza perezosa, cachear solo respuestas externas y dejar cache distribuido/rate limiting para feature 020 |
