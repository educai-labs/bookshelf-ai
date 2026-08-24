# 014 · Add Book Modal + ISBN — Plan de Implementación

**Feature:** `014-add-book-modal-isbn`  
**Estado spec:** `propuesta`  
**Fecha:** 2026-08-21

---

## Enfoque

Implementar el flujo "Añadir libro" como un **Dialog modal compartido** (shadcn/ui `Dialog`) que se abre desde dos puntos de entrada en el dashboard: botón en `DashboardHeader` y botón en `EmptyState`. El modal encapsula toda la lógica: input ISBN con normalización/validación, llamada a `GET /api/v1/books/lookup?isbn=...`, preview de metadatos, y `POST /api/v1/books` para guardar.  

**Por qué este enfoque:**
- **Reutilización**: Un solo componente `AddBookModal` sirve a ambos triggers (header + empty state), evitando duplicación.
- **Stack alineado**: Usa shadcn/ui `Dialog`, `Input`, `Button`, `Toast` (ya en dependencias), Zod para validación ISBN, React Query (`@tanstack/react-query`) para invalidación de cache tras creación.
- **Separación de responsabilidades**: Lógica de ISBN (normalización, validación) en hook `useIsbnInput`; llamada a API en hook `useAddBook`; preview en componente `BookMetadataPreview`.
- **Accesibilidad nativa**: shadcn `Dialog` ya implementa focus trap, `Esc` para cerrar, `aria-labelledby`/`aria-describedby`.

---

## Implementación

### 1. Hook `useIsbnInput` — Lógica de input ISBN
**Archivo:** `apps/web/src/hooks/useIsbnInput.ts`
- Estado: `isbn` (string, solo dígitos), `formattedIsbn` (con guiones para display), `isValid` (boolean, length === 13).
- `onChange(raw: string)` → quita no-dígitos, actualiza estado, formatea para display `978-X-XXX-XXXXX-X`.
- `reset()` → limpia estado.
- Tests: `useIsbnInput.test.ts` (normalización, validación 13 dígitos, formato display).

### 2. Hook `useAddBook` — Mutación crear libro
**Archivo:** `apps/web/src/hooks/useAddBook.ts`
- Usa `useMutation` (React Query) con `mutationFn: (isbn13: string) => POST /api/v1/books { isbn13, status: "want_to_read" }`.
- `onSuccess`: `queryClient.invalidateQueries({ queryKey: ['books'] })`, toast éxito, callback `onClose?.()`.
- `onError`: Mapea status codes → mensajes toast (400, 404, 409, 500).
- Expone: `mutate`, `isPending`, `isError`, `error`.
- Tests: `useAddBook.test.ts` (mock API, happy path, cada error code).

### 3. Componente `BookMetadataPreview` — Preview de metadatos
**Archivo:** `apps/web/src/components/books/BookMetadataPreview.tsx`
- Props: `data: BookLookupResponse` (tipo compartido `apps/web/src/types/book.ts`).
- Render: `Image` portada (fallback placeholder), `title`, `authors` (join ", "), `page_count`, `publisher`, `published_date`, `description` (truncado 3 líneas + "Ver más" expandible).
- Skeleton loading mientras fetch.
- Tests: `BookMetadataPreview.test.tsx` (render campos, truncado descripción, skeleton).

### 4. Componente `AddBookModal` — Modal principal
**Archivo:** `apps/web/src/components/books/AddBookModal.tsx`
- `Dialog` con `DialogTrigger` (recibe `children` = botón externo), `DialogContent` centrado `max-w-md`.
- Estado interno: `stage: 'input' | 'preview' | 'saving'`.
- Usa `useIsbnInput` + `useAddBook`.
- Flujo:
  1. Stage `input`: `Input` ISBN (value=formatted, onChange=hook), helper text, Button "Buscar" (disabled=!isValid, loading=lookupPending).
  2. Al click "Buscar": `GET /api/v1/books/lookup?isbn=...` (fetch directo o `useQuery` con `enabled: false` + `refetch`), set `stage: 'preview'` con datos.
  3. Stage `preview`: `BookMetadataPreview` + Button "Guardar libro" (loading=mutationPending).
  4. Stage `saving`: Button disabled, spinner.
- Accesibilidad: `DialogTitle` "Añadir libro por ISBN", `DialogDescription` explicativo, `Input` con `label` + `aria-describedby` helper, `aria-live` en toasts (via `useToast`).
- Tests: `AddBookModal.test.tsx` (RTL — happy path completo mock API, validación ISBN, error 404, error 409, cerrar sin guardar, focus trap).

### 5. Integración en `DashboardHeader`
**Archivo:** `apps/web/src/components/dashboard/DashboardHeader.tsx`
- Añade `AddBookModal` envolviendo botón existente "Añadir libro" (o nuevo botón si no existe).
- `DialogTrigger asChild` → `<Button>+ Añadir libro</Button>`.

### 6. Integración en `EmptyState`
**Archivo:** `apps/web/src/components/dashboard/EmptyState.tsx`
- Añade `AddBookModal` envolviendo botón "Añadir tu primer libro".
- Mismo modal (import compartido), distinta label en botón trigger.

### 7. Tipos compartidos
**Archivo:** `apps/web/src/types/book.ts` (crear o extender)
- `BookLookupResponse`: `{ cover_url, title, authors: string[], page_count, publisher, published_date, description }`.
- `BookCreateRequest`: `{ isbn13: string; status: 'want_to_read' }`.
- `BookResponse`: extiende `BookLookupResponse` + `id, user_id, status, rating, created_at, updated_at`.

### 8. API Client — Función lookup
**Archivo:** `apps/web/src/lib/api/books.ts` (crear o extender)
- `lookupBook(isbn13: string)`: `GET /api/v1/books/lookup?isbn=...` → `BookLookupResponse`.
- `createBook(payload: BookCreateRequest)`: `POST /api/v1/books` → `BookResponse`.
- Manejo errores: lanza `ApiError` con `status, code, message` para que hooks mapeen a toasts.

---

## Decisiones

| Decisión | Justificación | Alternativas descartadas |
|----------|---------------|--------------------------|
| **Un solo `AddBookModal` compartido** (DialogTrigger con `asChild`) | Evita duplicar lógica/estado; ambos triggers abren el mismo flujo. | Dos modales separados → duplicación de código, bugs inconsistentes. |
| **Hook `useIsbnInput` separado** | Lógica de normalización/validación reutilizable y testeable en aislamiento. | Lógica inline en modal → harder to test, mezcla UI + lógica. |
| **Hook `useAddBook` con React Query `useMutation`** | Invalida cache automático (`invalidateQueries`), loading/error states built-in, retry configurable. | `fetch` manual + `useState` → boilerplate, sin cache invalidation automático. |
| **Lookup ISBN via `fetch` directo (no `useQuery`)** en modal | Lookup es acción explícita del usuario (click "Buscar"), no query reactiva; `useQuery` con `enabled: false` + `refetch` añade complejidad innecesaria. | `useQuery` con `enabled` → más código para mismo resultado. |
| **Zod schema para validación ISBN en frontend** | Consistencia con convención "Zod en frontend (forms, API responses)". | Validación manual regex → propenso a errores, no reutilizable. |
| **Toast via `useToast` (shadcn/ui)** | Ya en stack, `aria-live` automático, API simple. | `react-hot-toast` u otra lib → dependencia extra sin justificación. |
| **No edición de metadatos en preview** | Fuera de alcance (spec §Fuera de alcance). Default `want_to_read` sin rating. | Permitir edición → scope creep, feature 015 cubre edición en ficha. |

---

## Riesgos

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| **API lookup lenta / timeout** (Open Library + Google Books fallback) | UX degradada, usuario piensa que falló. | Loading state claro en botón "Buscar"; timeout 8s cliente; toast "Búsqueda tarda más de lo normal, reintenta" si >5s. |
| **ISBN inválido pasa validación frontend pero falla en backend (400)** | Confusión usuario. | Validación frontend estricta (13 dígitos, checksum ISBN-13 opcional pero recomendado). Backend devuelve 400 con `code: 'INVALID_ISBN'` → toast específico. |
| **Duplicado (409) race condition**: usuario click rápido "Guardar" dos veces | Dos requests, uno 409, toast error confuso. | `useMutation` con `mutationKey: ['addBook', isbn13]` + `throwOnError: false`; deshabilitar botón "Guardar" mientras `isPending`; idempotency key en backend (feature 008 ya la tiene). |
| **Modal no cierra tras éxito** (bug en `onSuccess`) | Usuario atrapado, UX rota. | Test RTL explícito: `waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())` tras click "Guardar". |
| **Focus trap / accesibilidad rota** en `Dialog` anidado o portal | Bloquea navegación teclado, incumple WCAG. | shadcn `Dialog` usa `radix-ui` (focus trap probado). Test manual: `Tab`/`Shift+Tab` dentro del modal, `Esc` cierra. |
| **Cache React Query no invalida** → grid no refresca | Usuario no ve libro recién añadido. | `invalidateQueries({ queryKey: ['books'] })` exacto; test de integración: mount dashboard → abrir modal → guardar → `waitFor` grid tiene nuevo libro. |

---

## Validación del plan

- [x] Respeta `tech-stack.md`: Next.js 14, shadcn/ui, Zod, React Query, TypeScript strict, Tailwind, Vitest+RTL.
- [x] Cubre **todos** los criterios de aceptación de `spec.md` (líneas 21-29).
- [x] No añade dependencias nuevas (shadcn/ui, @tanstack/react-query, zod ya en `package.json`).
- [x] No toca `supabase/migrations/`, no usa `service_role` en frontend, no hardcodea URLs.
- [x] Una feature "en curso" a la vez (Regla 0 SDD).