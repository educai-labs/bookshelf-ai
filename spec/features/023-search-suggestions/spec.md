# 023 · Search Suggestions (Typeahead)

**Estado:** hecho

## Qué hace

Añade **búsqueda con sugerencias en vivo (typeahead)**: a medida que el usuario escribe en un buscador, aparecen dinámicamente los libros que coinciden con el texto (título, autor o ISBN), **sin necesidad de pulsar ningún botón "buscar"**.

**Ubicaciones (2):**
1. **Buscador del dashboard / biblioteca** (feature 013): el input de búsqueda se convierte en combobox con dropdown de sugerencias en vivo.
2. **Modal de alta de libro** (feature 014): el input pasa a ser un **input combinado** (título, autor o ISBN) con detección de ISBN-13 completo; al elegir una sugerencia del catálogo se carga la preview directamente.

**Fuente de las sugerencias (merge de 2 orígenes):**
- **Biblioteca del usuario** (libros ya guardados; solo los suyos, RLS).
- **Catálogo externo** (Open Library primario / Google Books fallback), reutilizando y **extendiendo el servicio de la feature 008** con búsqueda por texto (hoy solo soporta ISBN).

**Comportamiento núcleo (acotado):**
- **Debounce 300ms** (alineado con 013): solo se dispara una petición tras 300ms sin teclear.
- **Mínimo 3 caracteres** (tras trim) para mostrar sugerencias; por debajo: dropdown oculto y **cero peticiones de red**.
- **Máximo 8 sugerencias** en el dropdown: primero las de biblioteca, el catálogo rellena el resto.
- **Deduplicación por ISBN13** con prioridad biblioteca: si un libro del catálogo ya está en la biblioteca, se muestra una única entrada (gana la de biblioteca) con badge "En tu biblioteca".
- **Fail-soft**: si el catálogo externo falla o tarda (timeout 2s, sin reintentos), se devuelven solo sugerencias de biblioteca — nunca error duro para el usuario.
- **Cache en memoria de búsquedas externas con TTL 1h** (patrón 008).

**Selección de sugerencias:**
- Dashboard + sugerencia de biblioteca → navega a `/book/[id]`.
- Dashboard + sugerencia de catálogo → abre el modal "Añadir libro" (014) con el ISBN precargado → flujo existente lookup → preview → guardar.
- Dashboard + Enter sin selección → aplica el texto como filtro `q` del grid (comportamiento 013 intacto).
- Modal + sugerencia de catálogo → carga la preview con metadatos (lookup por ISBN vía 008/009) → "Guardar libro" (flujo 014 sin cambios).
- Modal + coincidencia en biblioteca → marcada "Ya en tu biblioteca" (previene el 409 antes de intentar guardar).
- Escribir un ISBN-13 completo a mano en el modal **sigue funcionando** como hoy (detección de ISBN completo, feature 014).

**Estados y accesibilidad:** loading (indicador dentro del dropdown), vacío ("Sin resultados para 'X'"), error externo (silencioso: solo biblioteca). Navegación por teclado (↑/↓ mueven, Enter selecciona, Esc cierra el dropdown — en el modal, Esc cierra primero el dropdown, no el modal), foco visible, roles ARIA de combobox (`role="combobox"`, `aria-expanded`, `aria-activedescendant`, opciones `role="option"`), `alt` en portadas. Todos los textos nuevos en es/en (i18n de 022).

## Por qué

La búsqueda es la vía principal de navegación en una biblioteca que crece: hoy (013) el buscador solo filtra el grid y únicamente por título/autor. El typeahead da feedback inmediato y salto directo a la ficha. Además, muchos usuarios no conocen el ISBN del libro que quieren añadir: esta feature mantiene el principio de misión "ISBN como llave maestra, nada de entrada manual" porque buscar por título/autor **resuelve** el ISBN vía catálogo externo (008) — los metadatos siguen viniendo de Open Library/Google Books, nunca tecleados. El merge biblioteca+catálogo en el modal previene duplicados (409) y acelera el alta. Se apoya al 100% en features hechas (008, 009, 013, 014): riesgo bajo, valor UX alto.

## Criterios de aceptación

**Backend (endpoint + servicio):**

- [ ] Existe `GET /api/v1/books/suggestions?q=&limit=` con `Depends(get_current_user)`; sin token → 401 con formato `{code, message}`.
- [ ] `q` obligatorio (422 si falta o queda vacío tras trim); `limit` default 8 con clamp 1–20.
- [ ] Búsqueda en biblioteca por `title` ILIKE, cualquier elemento de `authors` ILIKE e `isbn13` ILIKE; cada item devuelve `source: "library"`, `book_id`, `isbn13`, `title`, `authors`, `cover_url`, `in_library: true`.
- [ ] Aislamiento: las sugerencias de biblioteca solo contienen libros del usuario autenticado (test: usuario B nunca ve libros de A).
- [ ] Con `len(q) < 3` el endpoint NO llama al catálogo externo (test con mocks: 0 llamadas HTTP) y devuelve solo biblioteca.
- [ ] Búsqueda externa: el servicio de 008 se extiende con búsqueda por texto; Open Library primario, Google Books fallback; normaliza a la misma forma (`source: "catalog"`, `in_library` calculado).
- [ ] Las sugerencias de catálogo **sin ISBN13 resuelto se descartan** (el flujo de alta depende del ISBN, llave maestra).
- [ ] Timeout externo 2s sin reintentos; si ambas fuentes fallan → 200 con solo resultados de biblioteca (fail-soft) + log del error.
- [ ] Cache en memoria de búsquedas externas (TTL 1h, patrón 008): segunda búsqueda idéntica no genera llamadas HTTP externas (test con mocks).
- [ ] Merge/dedup: orden biblioteca-primero, catálogo rellena hasta `limit`; sin `isbn13` duplicados en la lista final; ante duplicado gana la entrada de biblioteca (conserva `book_id`).
- [ ] Máximo 1 llamada de búsqueda externa por petición; latencia de respuestas sin llamada externa (o cache hit) < 300ms promedio.

**Frontend (dashboard + modal):**

- [ ] Dashboard: al teclear ≥ 3 chars, el dropdown de sugerencias aparece en vivo tras 300ms de pausa, **sin pulsar ningún botón**.
- [ ] Tecleo rápido ("gua"→"guas"→"guaso", < 300ms entre teclas) produce **exactamente 1 petición** con la consulta final.
- [ ] < 3 chars o input vacío: dropdown oculto y cero peticiones de red.
- [ ] Estados del dropdown: loading visible; "Sin resultados para 'X'" con lista vacía; si el endpoint falla → toast no bloqueante y el buscador **sigue funcionando como filtro** del grid (013 no degradado).
- [ ] Selección en dashboard: biblioteca → navega a `/book/[id]`; catálogo → abre `AddBookModal` (014) con ISBN precargado y preview cargada.
- [ ] Enter sin selección en dashboard → filtra el grid con `q` (comportamiento 013 intacto).
- [ ] Modal 014: input combinado acepta texto libre con sugerencias en vivo (mismas reglas debounce/mínimo/merge); selección de catálogo → preview + "Guardar libro" (flujo 014 sin cambios); coincidencia en biblioteca marcada "Ya en tu biblioteca".
- [ ] Escribir un ISBN-13 a mano en el modal mantiene el flujo actual de 014 (detección de ISBN completo, normalización, lookup, 400/404/409/500 con toasts).
- [ ] Teclado: ↑/↓ mueven el resaltado, Enter selecciona, Esc cierra el dropdown (en modal, Esc NO cierra el modal con el dropdown abierto); foco visible; ARIA combobox correcto (`aria-expanded`, `aria-activedescendant`, `role="option"`).
- [ ] Render: portadas con `alt` y fallback placeholder; badge "En tu biblioteca" en entradas deduplicadas; ninguna entrada duplicada visible.
- [ ] i18n: todos los textos nuevos (dropdown, estados, badges, toasts) traducidos es/en, sin strings hardcoded (criterio 022).
- [ ] Responsive: dropdown usable en <640px (ancho completo, lista scrollable con max-height, targets táctiles adecuados).

**Tests:**

- [ ] Frontend (Vitest+RTL): debounce/1-request-por-pausa, umbral 3 chars, navegación teclado, merge/dedup render, selecciones dashboard (navegar vs modal), estados loading/vacío/error, integración modal.
- [ ] Backend (pytest+httpx): 401, validación `q`/`limit`, búsqueda biblioteca por título/autor/ISBN, aislamiento por usuario, umbral <3 chars sin llamadas externas, fail-soft externo, cache hit sin HTTP, dedup/orden/limit.

## Fuera de alcance

- Búsqueda semántica/vectorial de libros (pgvector es para notas; aquí solo léxica ILIKE) — feature futura.
- Tolerancia a typos / fuzzy (trigram similarity) — feature futura.
- Búsqueda dentro del contenido de notas — feature futura.
- Sugerencias de recomendación IA ("porque te puede gustar") → feature 018.
- Historial de búsquedas / búsquedas guardadas — feature futura.
- Nuevas preferencias de usuario en settings (nº de sugerencias, fuentes on/off) → no se añaden prefs a 022.
- Búsqueda por editorial, año u otros campos — fuera.
- Extender el filtro `q` del listado (009) a ISBN — el matching por ISBN vive solo en el endpoint de sugerencias.
- Cache distribuido (Redis) y rate limiting por usuario / API keys de pago → feature 020.
- Exponer sugerencias vía MCP → feature 019 (`search_books` cubre su caso).
