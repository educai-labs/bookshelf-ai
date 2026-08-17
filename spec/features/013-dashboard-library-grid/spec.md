# 013 · Dashboard Library Grid

**Estado:** propuesta

## Qué hace

Implementa la vista principal `/dashboard` (layout `(dashboard)`) con grid responsivo de tarjetas de libros ("Library Grid").

Componentes:
- **Grid**: CSS Grid responsive: 1 col (<640px), 2 col (640-1024px), 3 col (1024-1280px), 4 col (>1280px). Gap 1.5rem.
- **BookCard**: portada (aspect-ratio 2/3, `object-cover`, fallback placeholder), título (truncado 2 líneas), autor(es), badge status (want_to_read=gray, reading=blue, read=green), rating stars (1-5, readonly, gris si sin rating).
- **Filtros** (sticky top):
  - Tabs status: "Todos", "Quiero leer", "Leyendo", "Leídos" → filtra `status`.
  - Select rating: "Todas", "★★★★★", "★★★★", ... → filtra `rating >= X`.
  - Input búsqueda: debounced 300ms → `q` param (busca título/autores).
- **Estados**:
  - Loading: `Skeleton` cards (shadcn) mientras `GET /api/v1/books` responde.
  - Empty: ilustración + "Tu biblioteca está vacía" + botón "Añadir tu primer libro" → abre modal (feature 014).
  - Error: toast + botón "Reintentar".
- **Paginación**: scroll infinito (IntersectionObserver) o botón "Cargar más" (simpler: botón). Page size 20.
- **Click en card** → navega a `/book/[id]` (feature 015).

Data fetching: Server Component en `page.tsx` llama `GET /api/v1/books` con filtros iniciales (via `createServerClient`). Client components para filtros/interactividad.

## Por qué

Dashboard es la "home" del usuario. Grid visual + filtros + búsqueda cubren navegación típica de biblioteca personal. Server Components para data inicial + Client para interactividad = rendimiento + SEO (aunque privado). Scroll infinito evita paginación compleja.

## Criterios de aceptación

- [ ] `src/app/(dashboard)/dashboard/page.tsx` Server Component: fetch inicial `books` (filtros default), pasa a `LibraryGrid` client component.
- [ ] `LibraryGrid` client: estado filtros (status, rating, q), debounce búsqueda (`useDeferredValue` + `setTimeout` 300ms), llama `GET /api/v1/books` con params, renderiza cards.
- [ ] `BookCard` componente: `Image` (Next.js) con `fill` + `sizes` responsive; fallback `onError` → placeholder SVG.
- [ ] Badge status: `variant` mapping correcto; rating stars: componente `RatingStars` readonly.
- [ ] Filtros: tabs `Button` group (shadcn), select `Select`, input `Input` con `onChange` debounced.
- [ ] Empty state: muestra cuando `total === 0`; botón abre `AddBookModal` (feature 014).
- [ ] Loading: `Skeleton` grid (8 cards) mientras primer fetch.
- [ ] Paginación: botón "Cargar más" → incrementa `page`, append items, deshabilita si `page * page_size >= total`.
- [ ] Responsive verificado en breakpoints Tailwind (sm, md, lg, xl).
- [ ] Tests: RTL para filtros, debounce, empty/loading/error states; Cypress para flujo completo login → dashboard → grid.

## Fuera de alcance

- Modal "Añadir libro" (feature 014).
- Detalle de libro `/book/[id]` (feature 015).
- Ordenación por fecha/alfabético (feature futura).
- Vista lista / tabla alternativa.
- Drag & drop reordenar.