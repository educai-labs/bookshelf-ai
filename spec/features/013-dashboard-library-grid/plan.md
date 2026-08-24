# Plan: 013 · Dashboard Library Grid

## Enfoque

Implementar la vista `/dashboard` siguiendo la arquitectura **Server Component + Client Components** de Next.js 14 App Router:

1. **`page.tsx` (Server Component)**: Fetch inicial de libros con filtros por defecto usando `createServerClient()` (server-side Supabase client). Pasa datos a `LibraryGrid` como props iniciales.
2. **`LibraryGrid` (Client Component)**: Maneja estado de filtros (status, rating, búsqueda), debounce 300ms, paginación "Cargar más", y renderiza grid de `BookCard`.
3. **`BookCard` (Client Component)**: Tarjeta individual con `Image` (Next.js), badge de status, estrellas de rating readonly, y click → navegación a `/book/[id]`.
4. **Componentes de UI shadcn/ui**: Tabs (status), Select (rating), Input (búsqueda), Skeleton (loading), Toast (error), Button (cargar más / empty state).

**Por qué este enfoque**: Respeta el stack (Next.js App Router, Supabase server client, shadcn/ui). Server Component para SEO/performance inicial + Client para interactividad evita hydration mismatch y permite streaming. Paginación por botón "Cargar más" es más simple y accesible que scroll infinito.

---

## Implementación

### 1. Estructura de archivos a crear/modificar

```
apps/web/src/
├── app/(dashboard)/dashboard/
│   ├── page.tsx                    # Server Component: fetch inicial + layout
│   └── loading.tsx                 # (opcional) Suspense boundary loading
├── components/
│   ├── dashboard/
│   │   ├── LibraryGrid.tsx         # Client: grid + filtros + paginación
│   │   ├── BookCard.tsx            # Client: tarjeta libro individual
│   │   ├── StatusFilterTabs.tsx    # Client: tabs filtro status
│   │   ├── RatingFilterSelect.tsx  # Client: select filtro rating
│   │   ├── SearchInput.tsx         # Client: input búsqueda debounced
│   │   ├── LoadMoreButton.tsx      # Client: botón paginación
│   │   ├── EmptyState.tsx          # Client: estado vacío + botón AddBookModal
│   │   └── ErrorState.tsx          # Client: toast error + retry
│   ├── ui/                         # shadcn/ui components (ya existentes)
│   └── book/
│       └── RatingStars.tsx         # Client: estrellas readonly (reutilizable)
├── lib/
│   ├── supabase/
│   │   ├── server.ts               # createServerClient() (existente)
│   │   └── browser.ts              # createBrowserClient() (existente)
│   ├── hooks/
│   │   ├── useDebounce.ts          # Hook debounce genérico (300ms)
│   │   └── useBooks.ts             # Hook fetch libros con filtros/paginación
│   ├── types/
│   │   └── book.ts                 # Tipos Book, BookStatus, BookFilters, PaginatedResponse
│   └── utils/
│       └── cn.ts                   # clsx + tailwind-merge (existente)
└── app/api/v1/books/route.ts       # (Backend) GET /api/v1/books - ya implementado en feature 00X
```

> **Nota**: El endpoint `GET /api/v1/books` con query params `status`, `rating_min`, `q`, `page`, `page_size` debe existir (feature previa). Este plan asume que está disponible.

---

### 2. Pasos técnicos detallados

#### Paso 1: Tipos y utilidades compartidas (`lib/types/book.ts`, `lib/hooks/useDebounce.ts`)

- **`lib/types/book.ts`**: Definir interfaces TypeScript estrictas:
  ```ts
  type BookStatus = 'want_to_read' | 'reading' | 'read';
  interface Book {
    id: string;
    isbn13: string;
    title: string;
    authors: string[];
    cover_url: string | null;
    status: BookStatus;
    rating: number | null;
    // ...otros campos según modelo
  }
  interface BookFilters {
    status?: BookStatus;
    rating_min?: number; // 1-5
    q?: string;
  }
  interface PaginatedBooks {
    data: Book[];
    total: number;
    page: number;
    page_size: number;
  }
  ```
- **`lib/hooks/useDebounce.ts`**: Hook genérico `useDebounce<T>(value: T, delay: number): T` usando `useDeferredValue` + `useEffect` + `setTimeout`.

#### Paso 2: Hook de datos `useBooks` (`lib/hooks/useBooks.ts`)

- Client-side hook que encapsula `fetch('/api/v1/books', { params })` con:
  - Parámetros: `filters: BookFilters`, `page: number`, `pageSize: number` (default 20).
  - Retorna: `{ books: Book[]; total: number; isLoading: boolean; error: Error | null; loadMore: () => Promise<void>; hasMore: boolean }`.
  - Manejo de estado: `useState` para data, loading, error; `useCallback` para `loadMore` que incrementa page y hace append.
  - Debounce interno para `filters.q` (usa `useDebounce`).

#### Paso 3: Componente `RatingStars` (`components/book/RatingStars.tsx`)

- Props: `rating: number | null`, `max?: number` (default 5), `size?: 'sm' | 'md' | 'lg'`.
- Render: 5 estrellas SVG (amarillo/amber-500 para relleno, gris para vacías). `readonly` (sin interacción).
- Accesibilidad: `role="img"`, `aria-label="Rating: X de 5"`.

#### Paso 4: Componente `BookCard` (`components/dashboard/BookCard.tsx`)

- Props: `book: Book`, `onClick: () => void`.
- Estructura:
  - `Card` (shadcn) con `overflow-hidden`, `transition-shadow hover:shadow-lg`.
  - `Image` (Next.js) con `fill`, `sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"`, `className="aspect-[2/3] object-cover"`.
  - `onError` → placeholder SVG inline (base64 o componente `CoverPlaceholder`).
  - `CardContent`: Título (2 líneas max: `line-clamp-2`), autores (1 línea `truncate`), `div` flex con `RatingStars` + `Badge` (status).
- Badge status mapping:
  - `want_to_read` → `variant="secondary"` (gray)
  - `reading` → `variant="default"` (blue)
  - `read` → `variant="outline"` (green text, border green)
- Click en card → `onClick` (navegación via `router.push(`/book/${book.id}`)`).

#### Paso 5: Componentes de filtros (`components/dashboard/`)

| Componente | Props | Descripción |
|------------|-------|-------------|
| `StatusFilterTabs` | `value: BookStatus \| 'all'`, `onChange: (v) => void` | `Tabs` shadcn con 4 triggers: "Todos", "Quiero leer", "Leyendo", "Leídos". |
| `RatingFilterSelect` | `value: number \| 'all'`, `onChange: (v) => void` | `Select` shadcn con opciones: "Todas", "★★★★★", "★★★★", "★★★", "★★", "★". Value numérico 1-5. |
| `SearchInput` | `value: string`, `onChange: (v) => void`, `debounceMs?: number` | `Input` shadcn con `placeholder="Buscar título o autor..."`. Internamente usa `useDebounce` (300ms) y llama `onChange` con valor debounced. |

#### Paso 6: Componente `LibraryGrid` (`components/dashboard/LibraryGrid.tsx`)

- **Props**: `initialBooks: Book[]`, `initialTotal: number`, `initialFilters?: BookFilters`.
- **Estado interno**:
  - `filters: BookFilters` (merge initial + cambios).
  - `page: number` (inicial 1).
  - `books: Book[]` (inicial `initialBooks`).
  - `total: number` (inicial `initialTotal`).
  - `isLoading: boolean`, `isLoadingMore: boolean`, `error: Error | null`.
- **Efectos**:
  - `useEffect` con `[filters]` → reset `page=1`, `books=[]`, fetch page 1.
  - Fetch usa `useBooks` hook (o `fetch` directo con AbortController).
- **Render**:
  - Header sticky (`sticky top-0 z-10 bg-background/95 backdrop-blur p-4 border-b`): fila flex con `StatusFilterTabs`, `RatingFilterSelect`, `SearchInput` (responsive: stack en móvil, fila en desktop).
  - Grid: `div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"`.
  - Map `books` → `BookCard` con `onClick` navegación.
  - Loading inicial: `Skeleton` grid (8 cards) mientras `isLoading`.
  - Loading more: spinner en botón "Cargar más".
  - Empty state: `<EmptyState />` si `books.length === 0 && !isLoading`.
  - Error state: `<ErrorState />` si `error` (toast + botón retry que re-fetchea).
  - Paginación: `<LoadMoreButton />` si `hasMore` (`page * pageSize < total`).

#### Paso 7: Estados Empty / Error / LoadMore (`components/dashboard/`)

- **`EmptyState.tsx`**: Ilustración (SVG o componente `LibraryEmpty`), texto "Tu biblioteca está vacía", `Button` "Añadir tu primer libro" → `onClick` abre `AddBookModal` (import dinámico de feature 014, o callback prop `onAddBook`).
- **`ErrorState.tsx`**: `Alert` (shadcn) variant="destructive" con mensaje + `Button` "Reintentar" → callback `onRetry`.
- **`LoadMoreButton.tsx`**: `Button` variant="outline" size="lg" className="w-full", disabled si `isLoadingMore || !hasMore`, muestra spinner si loading.

#### Paso 8: Página Server Component (`app/(dashboard)/dashboard/page.tsx`)

- `async function getInitialBooks(filters: BookFilters) { const supabase = createServerClient(); const { data, count } = await supabase.from('books').select(...).eq('user_id', user.id).range(0, 19); return { books: data, total: count } }`
- Obtener `user_id` via `supabase.auth.getUser()` (server).
- Filtros default: `status: undefined` (todos), `rating_min: undefined`, `q: ''`.
- Render: `<LibraryGrid initialBooks={books} initialTotal={total} initialFilters={defaultFilters} />`.
- Metadata: `export const metadata = { title: 'Mi Biblioteca | Bookshelf' }`.

#### Paso 9: Tests

| Archivo | Qué testea |
|---------|------------|
| `components/dashboard/__tests__/LibraryGrid.test.tsx` | RTL: render grid, filtros cambian query params, debounce búsqueda (300ms), empty/loading/error states, loadMore append. |
| `components/dashboard/__tests__/BookCard.test.tsx` | RTL: render cover/title/author/badge/stars, click navega, fallback cover onError. |
| `components/dashboard/__tests__/SearchInput.test.tsx` | RTL: debounce llama onChange tras 300ms, no llama en cada keystroke. |
| `components/book/__tests__/RatingStars.test.tsx` | RTL: render correcto stars según rating, null = todas grises. |
| `app/(dashboard)/dashboard/__tests__/page.test.tsx` | Vitest: Server Component fetch llama supabase con filtros correctos. |
| `cypress/e2e/dashboard.cy.ts` | Cypress: login → dashboard → grid visible → filtra status → busca → carga más → click card navega a `/book/[id]`. |

#### Paso 10: Verificación visual y accesibilidad

- Breakpoints Tailwind: `sm` (640px), `md` (768px), `lg` (1024px), `xl` (1280px) → 1/2/3/4 cols.
- Gap `gap-6` (1.5rem).
- Focus visible en cards, botones, inputs (Tailwind `focus-visible:ring-2`).
- ARIA labels en filtros, rating stars, botones.
- Color contrast: badges status legibles en light/dark mode (shadcn defaults).

---

## Decisiones

| Decisión | Justificación | Alternativas descartadas |
|----------|---------------|--------------------------|
| **Server Component para fetch inicial** | Next.js 14 recomendación: data fetching en server, evita waterfall, mejor TTFB. | Client-side fetch con `useEffect` → flash de loading, peor SEO (aunque privado). |
| **Botón "Cargar más" vs Scroll infinito** | Más simple, accesible (teclado), control usuario, evita problemas IntersectionObserver en SSR. | Scroll infinito → complejidad, accesibilidad, hydratation issues. |
| **`useDebounce` con `useDeferredValue` + `setTimeout`** | React 18 concurrent features, no bloquea render, patron recomendado. | `lodash.debounce` → dependencia extra; `useTransition` solo para transiciones UI. |
| **shadcn/ui para todos los componentes base** | Consistencia visual, dark mode automático, accesible, ya en stack. | Componentes custom → reinventar rueda, mantenimiento. |
| **`Image` Next.js con `fill` + `sizes`** | Optimización automática (WebP/AVIF), responsive, CLS prevention. | `<img>` nativo → sin optimización, CLS risk. |
| **Placeholder SVG inline onError** | Sin request extra, instantáneo, controlable. | Imagen placeholder externa → request, latencia. |
| **Hook `useBooks` encapsula lógica fetch** | Separación concerns, reutilizable, testeable en aislamiento. | Lógica inline en `LibraryGrid` → componente gordo, difícil test. |

---

## Riesgos

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| **Hydration mismatch** entre Server Component (data inicial) y Client (estado filtros) | Alto: UI rota, warnings consola | Usar `suppressHydrationWarning` solo en contenedor root si necesario; asegurar que `initialBooks` === primera página client fetch. |
| **Debounce búsqueda no cancela request anterior** | Medio: race conditions, resultados desordenados | `AbortController` en `useBooks` / fetch; cancelar al cambiar `q`. |
| **Imagen cover no carga (404/timeout)** | Bajo: UX degradada | `onError` → placeholder SVG inmediato; `loading="lazy"` en images no visibles. |
| **Filtros status/rating no sincronizan con URL** | Medio: no shareable, no back/forward | Futuro: `useSearchParams` + `router.push` con params (fuera de alcance esta feature). |
| **Empty state botón "Añadir" requiere feature 014 (modal)** | Bloqueante si 014 no lista | Callback prop `onAddClick` en `EmptyState`; feature 014 proveerá modal; aquí solo stub o dynamic import. |
| **Tests Cypress lentos / flaky** | Medio: CI inestable | `cy.intercept` para mock API; `data-cy` attributes; run en headless CI. |
| **Responsive breakpoints no coinciden con diseño** | Bajo: visual off | Verificar en Chrome DevTools device toolbar; ajustar `grid-cols-*` si necesario. |

---

## Validación contra tech-stack

- ✅ **Next.js 14 App Router**: Server Component + Client Components pattern.
- ✅ **Supabase server client**: `createServerClient()` en `page.tsx` para fetch inicial.
- ✅ **TypeScript estricto**: Interfaces en `lib/types/book.ts`, props tipadas.
- ✅ **Tailwind + shadcn/ui**: Grid responsive, componentes base, dark mode via CSS variables.
- ✅ **Convenciones naming**: `camelCase` TS, `PascalCase` componentes, `snake_case` en API params.
- ✅ **Tests**: Vitest + RTL (unit/integration), Cypress (E2E).
- ✅ **No hardcodear URLs**: `/api/v1/books` relativo, Supabase via env.
- ✅ **No raw SQL en frontend**: Todo vía API route.
- ✅ **Límites duros**: Sin nuevas deps (shadcn/ui ya en stack), sin tocar migraciones, sin service_role en frontend.

---

**Listo para descomponedor** → generará `tasks.md` checklist a partir de este plan.