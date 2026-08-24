# 014 · Add Book Modal + ISBN — Checklist de Tareas

**Estado:** propuesta  
**Se basa en:** `plan.md` y `spec.md`

---

## 📋 Checklist principal

Estas tareas están ordenadas para fluidez de implementación. Cada tarea es una acción pequeña y accionable que puede marcarse como `[x]` al completarse.

- [x] **T1:** Crear `apps/web/src/types/book.ts` con interfaces TypeScript estrictas:
  - `BookLookupResponse` (`cover_url`, `title`, `authors: string[]`, `page_count`, `publisher`, `published_date`, `description`)
  - `BookCreateRequest` (`isbn13: string`, `status: 'want_to_read'`)
  - `BookResponse` (extiende `BookLookupResponse` + `id`, `user_id`, `status`, `rating`, `created_at`, `updated_at`)
- [x] **T2:** Crear hook `apps/web/src/hooks/useIsbnInput.ts` con estado `isbn` (solo dígitos), `formattedIsbn` (con guiones para display), `isValid` (boolean, length === 13)
  - Implementar `onChange(raw: string)` → quita no-dígitos, actualiza estado, formatea para display `978-X-XXX-XXXXX-X`
  - Implementar `reset()` → limpia estado
- [x] **T3:** Crear tests `useIsbnInput.test.ts` (normalización, validación 13 dígitos, formato display)
- [x] **T4:** Crear hook `apps/web/src/hooks/useAddBook.ts` con `useMutation` (React Query)
  - `mutationFn: (isbn13: string) => POST /api/v1/books { isbn13, status: "want_to_read" }`
  - Implementar `onSuccess`: `queryClient.invalidateQueries({ queryKey: ['books'] })`, toast éxito, callback `onClose?.()`
  - Implementar `onError`: mapea status codes → mensajes toast (400, 404, 409, 500)
  - Exponer: `mutate`, `isPending`, `isError`, `error`
- [x] **T5:** Crear tests `useAddBook.test.ts` (mock API, happy path, cada error code: 400, 404, 409, 500)
- [x] **T6:** Crear componente `apps/web/src/components/books/BookMetadataPreview.tsx` con props `data: BookLookupResponse`
  - Render: `Image` portada (fallback placeholder), `title`, `authors` (join ", "), `page_count`, `publisher`, `published_date`, `description` (truncado 3 líneas + "Ver más" expandible)
  - Implementar skeleton loading mientras fetch
- [x] **T7:** Crear tests `BookMetadataPreview.test.tsx` (render campos, truncado descripción, skeleton)
- [x] **T8:** Crear componente `apps/web/src/components/books/AddBookModal.tsx`
  - `Dialog` con `DialogTrigger` (recibe `children` = botón externo), `DialogContent` centrado `max-w-md`
  - Estado interno: `stage: 'input' | 'preview' | 'saving'`
  - Usa `useIsbnInput` + `useAddBook`
  - Flujo stage `input`: `Input` ISBN (value=formatted, onChange=hook), helper text, Button "Buscar" (disabled=!isValid, loading=lookupPending)
  - Flujo: al click "Buscar" → `GET /api/v1/books/lookup?isbn=...` → set `stage: 'preview'` con datos
  - Stage `preview`: `BookMetadataPreview` + Button "Guardar libro" (loading=mutationPending)
  - Stage `saving`: Button disabled, spinner
  - Accesibilidad: `DialogTitle` "Añadir libro por ISBN", `DialogDescription` explicativo, `Input` con `label` + `aria-describedby` helper, `aria-live` en toasts (via `useToast`)
- [x] **T9:** Crear tests `AddBookModal.test.tsx` (RTL — happy path completo mock API, validación ISBN, error 404, error 409, cerrar sin guardar, focus trap)
- [x] **T10:** Modificar `apps/web/src/components/dashboard/DashboardHeader.tsx` — añadir `AddBookModal` envolviendo botón existente "Añadir libro" con `DialogTrigger asChild` → `<Button>+ Añadir libro</Button>`
- [x] **T11:** Modificar `apps/web/src/components/dashboard/EmptyState.tsx` — añadir `AddBookModal` envolviendo botón "Añadir tu primer libro" (mismo modal importado, distinta label en trigger)
- [ ] **T12:** Validación contra criterios de aceptación de `spec.md`:
  - [ ] **T13:** Validar `AddBookModal` component: `Dialog` con `DialogTrigger` (botón header), `DialogContent` centrado, max-w-md
  - [ ] **T14:** Validar Input ISBN: `Input` con `onChange` normaliza (quita no-dígitos), valida longitud 13, muestra helper "Formato: 978XXXXXXXXXX"
  - [ ] **T15:** Validar Botón "Buscar": `disabled` si ISBN inválido; loading state durante fetch
  - [ ] **T16:** Validar Preview area: condicional (solo tras lookup exitoso). Muestra `BookMetadata` fields: `Image` portada, `title`, `authors` join ", ", `page_count`, `publisher`, `published_date`, `description` (truncado, "Ver más")
  - [ ] **T17:** Validar Botón "Guardar": `POST /api/v1/books` con `{ isbn13, status: "want_to_read" }`; success → `onSuccess` callback (cierra modal, `queryClient.invalidateQueries({ queryKey: ['books'] })`)
  - [ ] **T18:** Validar Manejo errores: 400 (ISBN inválido), 404 (no encontrado en OL/GB), 409 (ya en tu biblioteca), 500 (server) → toasts descriptivos
  - [ ] **T19:** Validar Accesibilidad: `Dialog` trap focus, `Esc` cierra, labels en inputs, `aria-live` para toasts
  - [ ] **T20:** Validar Tests: RTL — flujo completo happy path mock API, validación ISBN, errores 404/409, cerrar modal sin guardar
  - [ ] **T21:** Validar Integración: botón "Añadir libro" en `DashboardHeader` y `EmptyState` abre mismo modal (compartido)
- [ ] **T22:** Mover la feature a "Hecho" en `../../constitution/roadmap.md`
  > _Pendiente: según `AGENTS.md` (Fase 2, paso 8) el movimiento a "Hecho" lo ejecuta el subagente `roadmap` tras la aprobación del revisor. El implementador no modifica la constitución._

---

## Validación contra criterios de aceptación de `spec.md`

Estas tareas aseguran que todos los criterios de `spec.md` queden cubiertos antes de mover a "Hecho":

- [ ] **T23:** Validar que `AddBookModal` component cumple todos los criterales de aceptación del spec.md (líneas 21-29)
- [ ] **T24:** Validar que todos los tests RTL pasan (happy path, validación ISBN, errores 404/409, cerrar sin guardar)
- [ ] **T25:** Validar integración en DashboardHeader y EmptyState abren el modal compartido

---

## Mantenimiento (opcional)

_Eliminar esta sección si no aplica. Esta feature no requiere acciones recurrentes al tocarla en el futuro._

---

## Cierre administrativo

- [ ] **T26:** Mover la feature a "Hecho" en `../../constitution/roadmap.md`
  > _Pendiente: según `AGENTS.md` (Fase 2, paso 8) el movimiento a "Hecho" lo ejecuta el subagente `roadmap` tras la aprobación del revisor. El implementador no modifica la constitución._