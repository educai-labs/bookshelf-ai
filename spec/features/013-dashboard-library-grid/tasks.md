---
estado: "hecho"
---

# 013 · Dashboard Library Grid — Checklist de Tareas

**Estado:** hecho  
**Se basa en:** `plan.md` y `spec.md`

---

## Checklist principal

Estas tareas están ordenadas para fluidez de implementación. Cada tarea es una acción pequeña y accionable que puede marcarse como `[x]` al completarse.

- [x] **T1:** Crear `lib/types/book.ts` con interfaces TypeScript estrictas:
  `BookStatus` (`want_to_read` | `reading` | `read`), `Book` interface, `BookFilters` interface,
  `PaginatedBooks` interface. Definir tipos base para toda la feature.
- [x] **T2:** Crear `lib/hooks/useDebounce.ts` hook genérico `useDebounce<T>(value: T, delay: number): T`
  usando `useDeferredValue` + `useEffect` + `setTimeout` (300ms).
- [x] **T3:** Crear `lib/hooks/useBooks.ts` hook client-side que encapsula `fetch('/api/v1/books', { params })`:
  retorna `{ books, total, isLoading, error, loadMore, hasMore }`. Manejo de `useState`,
  `useCallback` para `loadMore` (append), debounce interno para `filters.q` usando `useDebounce`.
- [x] **T4:** Crear `components/book/RatingStars.tsx` componente readonly de estrellas:
  props `rating: number | null`, `max?: number` (default 5), `size?: 'sm' | 'md' | 'lg'`.
  Render: 5 estrellas SVG (amber-500 relleno, gris vacío). `role="img"`,
  `aria-label="Rating: X de 5"`. Sin interacción (readonly).
- [x] **T5:** Crear `components/dashboard/BookCard.tsx` tarjeta libro individual:
  props `book: Book`, `onClick: () => void`.
  Estructura: `Card` shadcn con `overflow-hidden`, `Image` Next.js `fill` + `sizes` responsive,
  `onError` → placeholder SVG inline, `CardContent`: título `line-clamp-2`, autores `truncate`,
  `RatingStars` + `Badge` status. Click → `onClick` (navegación a `/book/${book.id}`).
- [x] **T6:** Crear `components/dashboard/StatusFilterTabs.tsx` tabs shadcn status:
  props `value: BookStatus \| 'all'`, `onChange: (v) => void`. Triggers: "Todos",
  "Quiero leer", "Leyendo", "Leídos". Filtrar por `status`.
- [x] **T7:** Crear `components/dashboard/RatingFilterSelect.tsx` select shadcn rating:
  props `value: number \| 'all'`, `onChange: (v) => void`. Opciones: "Todas", "★★★★★",
  "★★★★", "★★★", "★★", "★". Value numérico 1-5. Filtrar `rating >= X`.
- [x] **T8:** Crear `components/dashboard/SearchInput.tsx` input búsqueda debounced:
  props `value: string`, `onChange: (v) => void`, `debounceMs?: number` (default 300ms).
  `placeholder="Buscar título o autor..."`. Internamente usa `useDebounce` (300ms) y llama
  `onChange` con valor debounced.
- [x] **T9:** Crear `components/dashboard/LibraryGrid.tsx` componente grid principal:
  props `initialBooks: Book[]`, `initialTotal: number`, `initialFilters?: BookFilters`.
  Estado interno: `filters` (merge initial + cambios), `page` (inicial 1), `books`,
  `total`, `isLoading`, `isLoadingMore`, `error`.
  Efectos: `useEffect` `[filters]` → reset `page=1`, `books=[]`, fetch page 1.
  Render: header sticky con filtros (StatusFilterTabs, RatingFilterSelect, SearchInput),
  grid responsivo (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`),
  map `books` → `BookCard` con `onClick`, Skeleton grid (8 cards) mientras `isLoading`,
  `<LoadMoreButton />` si `hasMore` (`page * pageSize < total`),
  `<EmptyState />` si `books.length === 0 && !isLoading`,
  `<ErrorState />` si `error`.
- [x] **T10:** Crear `components/dashboard/EmptyState.tsx` estado vacío:
  ilustración (SVG o componente `LibraryEmpty`), texto "Tu biblioteca está vacía",
  `Button` "Añadir tu primer libro" → callback `onAddBook` (dynamic import feature 014) o stub.
- [x] **T11:** Crear `components/dashboard/ErrorState.tsx` estado error:
  `Alert` (shadcn) variant="destructive" con mensaje + `Button` "Reintentar" → callback `onRetry`.
- [x] **T12:** Crear `components/dashboard/LoadMoreButton.tsx` botón cargar más:
  `Button` variant="outline" size="lg" className="w-full", disabled si `isLoadingMore || !hasMore`,
  muestra spinner si `isLoadingMore`.
- [x] **T13:** Crear `app/(dashboard)/dashboard/page.tsx` Server Component:
  `async function getInitialBooks(filters: BookFilters)` usando `createServerClient()`,
  fetch inicial de libros con filtros default (status: undefined, rating_min: undefined, q: '').
  Obtener `user_id` via `supabase.auth.getUser()` (server). Render:
  `<LibraryGrid initialBooks={books} initialTotal={total} initialFilters={defaultFilters} />`.
  Metadata: `export const metadata = { title: 'Mi Biblioteca | Bookshelf' }`.
- [x] **T14:** Crear `components/dashboard/__tests__/LibraryGrid.test.tsx` tests RTL:
  render grid, filtros camban query params, debounce búsqueda (300ms), empty/loading/error states,
  loadMore append.
- [x] **T15:** Crear `components/dashboard/__tests__/BookCard.test.tsx` tests RTL:
  render cover/title/author/badge/stars, click navega, fallback cover onError.
- [x] **T16:** Crear `components/dashboard/__tests__/SearchInput.test.tsx` tests RTL:
  debounce llama onChange tras 300ms, no llama en cada keystroke.
- [x] **T17:** Crear `components/book/__tests__/RatingStars.test.tsx` tests RTL:
  render correcto stars según rating, null = todas grises.
- [x] **T18:** Crear `app/(dashboard)/dashboard/__tests__/page.test.tsx` tests Vitest:
  Server Component fetch llama supabase con filtros correctos.
- [x] **T19:** Crear `cypress/e2e/dashboard.cy.ts` tests Cypress:
  login → dashboard → grid visible → filtra status → busca → carga más → click card navega a `/book/[id]`.
  > Nota: test type-checkeado y listo para CI. El binario de Cypress no se ejecuta en este entorno
  > (faltan libs del sistema `libnspr4`/`libgtk` y no hay permisos root); corre con `npm run test:e2e`
  > en un entorno con las dependencias de Cypress (ver `cypress.config.ts`).
- [x] **T20:** Verificar breakpoints Tailwind responsivos: `sm` (640px), `md` (768px),
  `lg` (1024px), `xl` (1280px) → 1/2/3/4 cols en grid. Gap `gap-6` (1.5rem).
  > Verificado: `grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`
  > en `LibraryGrid` (grid real y skeleton).
- [x] **T21:** Verificar focus visible en cards, botones, inputs (Tailwind `focus-visible:ring-2`),
  ARIA labels en filtros, rating stars, botones. Contraste de color: badges status legibles
  en light/dark mode (shadcn defaults).
  > Verificado: `BookCard` con `focus-visible:ring-2`; shadcn defaults `focus-visible:ring-1`
  > en Button/Input/Tabs; ARIA labels en `StatusFilterTabs` ("Filtrar por estado"),
  > `RatingFilterSelect` ("Filtrar por rating"), `SearchInput` ("Buscar título o autor"),
  > `RatingStars` (`role="img"` + `aria-label`), skeleton (`aria-label="Cargando libros"`),
  > `BookCard` (`role="button"` + `aria-label={title}`). Badges con variantes shadcn
  > (secondary/default/outline) legibles en ambos modos.

---

## Validación contra criterios de aceptación de `spec.md`

Estas tareas aseguran que todos los criterios de `spec.md` queden cubiertos antes de mover a "Hecho":

- [x] **T22:** Validar que `page.tsx` Server Component fetch inicial llama `createServerClient` con filtros correctos.
  > Validado: `page.test.tsx` verifica `from("books")`, `select("*, book_notes(count)")`, `eq("user_id", u1)`,
  > `range(0, 19)` y que los filtros default no aplican `gte`/`ilike`. Sin usuario → seed vacío.
- [x] **T23:** Validar que `LibraryGrid` gestiona estado filtros (status, rating, q), debounce búsqueda 300ms,
  y llama `GET /api/v1/books` con params, renderiza cards correctas.
  > Validado: `LibraryGrid.test.tsx` (9 tests): grid render, tab status → `status=reading`, select rating →
  > `rating=5`, búsqueda debounced sin request por keystroke, empty/loading/error, loadMore append.
- [x] **T24:** Validar que `BookCard` tiene `Image` Next.js con `fill` + `sizes` responsive, fallback `onError` → placeholder SVG.
  > Validado: `BookCard.test.tsx`: `sizes="(max-width: 640px) 100vw, ... 25vw"`, `fill`, fallback `onError`
  > → `data-testid="cover-placeholder"`, placeholder directo si `cover_url: null`.
- [x] **T25:** Validar mapping badges status: `want_to_read` → variant="secondary" (gray),
  `reading` → variant="default" (blue), `read` → variant="outline" (green text, border green).
  > Validado: `STATUS_VARIANTS` + `STATUS_CLASSES` en `BookCard.tsx`; test de labels por status.
- [x] **T26:** Validar que `RatingStars` es readonly, renderiza estrellas según rating, null = todas grises.
  > Validado: `RatingStars.test.tsx`: 3/5 rellenas con rating 3, todas grises con null, max custom, size.
- [x] **T27:** Validar que filtros usan componentes shadcn: `Tabs` (status), `Select` (rating), `Input` (búsqueda debounced).
  > Validado: `StatusFilterTabs` (Tabs), `RatingFilterSelect` (Select), `SearchInput` (Input + useDebounce).
- [x] **T28:** Validar que `EmptyState` muestra cuando `total === 0`; botón abre `AddBookModal` (feature 014).
  > Validado: se muestra cuando `books.length === 0 && !isLoading`; botón "Añadir tu primer libro" →
  > callback `onAddBook` (stub hasta feature 014, según plan/riesgos).
- [x] **T29:** Validar Loading: `Skeleton` grid (8 cards) mientras `isLoading` (primer fetch).
  > Validado: `books-skeleton` con 8 `<Skeleton />` (test en `LibraryGrid.test.tsx`).
- [x] **T30:** Validar Paginación: botón "Cargar más" → incrementa `page`, append items,
  deshabilita si `page * page_size >= total`.
  > Validado: `LoadMoreButton` `disabled={isLoadingMore || !hasMore}`; `useBooks.hasMore = page*pageSize < total`;
  > test de append 20→25 items y desaparición del botón.
- [x] **T31:** Validar responsive verificado en breakpoints Tailwind (sm, md, lg, xl).
  > Validado: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4` + `gap-6` (T20).
- [x] **T32:** Validar tests: RTL para filtros, debounce, empty/loading/error states; Cypress para flujo completo.
  > Validado: 57 tests Vitest/RTL pasan (cobertura 98.58%); `cypress/e2e/dashboard.cy.ts` type-checkeado
  > (ejecución requiere entorno CI con deps del sistema de Cypress).

---

## Mantenimiento (opcional)

_Eliminar esta sección si no aplica. Esta feature no requiere acciones recurrentes al tocarla en el futuro._

---

## Cierre administrativo

- [x] **T33:** Mover la feature a "Hecho" en `../../constitution/roadmap.md`
  > _Pendiente: según `AGENTS.md` (Fase 2, paso 8) el movimiento a "Hecho" lo ejecuta el subagente `roadmap` tras la aprobación del revisor. El implementador no modifica la constitución._

---

**Notas:**
- Tareas T1-T21 corresponden a los pasos de implementación del `plan.md` y están diseñadas para ser independientes y marcarse `[x]` completadas individualmente.
- Tareas T22-T32 aseguran que todos los criterios de `spec.md` queden cubiertos antes de mover a "Hecho".
- T33 es el cierre administrativo que permite la feature pasar al estado `hecho` en la carretera.
- **Componentes shadcn/ui** ya existentes en el stack: `Button`, `Card`, `Input`, `Select`, `Tabs`, `Alert`, `Skeleton`, `Badge`, `Avatar`, `Tooltip`, `Toast` (sonner). No incluir como tareas separadas.
- **Datos dummy/mock** para tests: usar `supabase` mock setup ya creado en `vitest.setup.ts` (mismo patrón que feature 011).