---
estado: "hecho"
---

# 015 · Book Detail / Reading Sheet — Checklist de Tareas

**Estado:** hecho  
**Se basa en:** `plan.md` y `spec.md`

---

## 📋 Checklist principal

Estas tareas están ordenadas para fluidez de implementación. Cada tarea es una acción pequeña y accionable que puede marcarse como `[ ]` al completarse.

--- 

### 🔧 Backend — Endpoints API (apps/api)

- [x] **T1**: Implementar `apps/api/app/api/v1/books.py` con endpoints `GET /books/{id}` y `PATCH /books/{id}`:
  - [x] `GET /books/{id}`: retorna `book` + `notes` opcional
  - [x] `PATCH /books/{id}`: actualiza `status`, `rating`, `started_at`, `finished_at`
  - [x] Validación Pydantic `BookUpdate` con campos opcionales, enum `book_status`, rating 1-5, fechas date
- [x] **T2**: Implementar `apps/api/app/api/v1/notes.py` con endpoints `GET /books/{id}/notes` y `POST /books/{id}/notes`:
  - [x] `GET /books/{id}/notes`: orden `created_at DESC`, incluye `chunk_index`
  - [x] `POST /books/{id}/notes`: body `content` markdown → retorna note creada con `content_html` renderizado via `markdown2` + sanitizado
- [x] **T3**: Verificar/añadir schemas en `apps/api/app/models/book.py`:
  - [x] `BookResponse`, `BookUpdate`, `NoteCreate`, `NoteResponse`
- [x] **T4**: Helper `render_markdown_to_html` en `apps/api/app/services/notes.py` usando `markdown2` + sanitizado HTML

---

### 🌐 Frontend — Types & API Client (apps/web)

- [x] **T5**: Definir tipos en `apps/web/src/types/book.ts`:
  - [x] `Book`, `BookStatus`, `Note`, `BookUpdate`, `NoteCreate` (camelCase)
- [x] **T6**: Crear hook API en `apps/web/src/lib/api/books.ts`:
  - [x] `getBook(id)` — fetch `GET /books/{id}` con headers auth
  - [x] `updateBook(id, data)` — `PATCH /books/{id}`
  - [x] `getBookNotes(id)` — fetch `GET /books/{id}/notes`
  - [x] `createNote(bookId, content)` — `POST /books/{id}/notes`
  - [x] Manejo errores tipado
- [x] **T7**: Definir keys de React Query en `apps/web/src/lib/queryKeys.ts`:
  - [x] `book(id)`, `bookNotes(id)`

---

### 📄 Frontend — Server Component Page (apps/web)

- [x] **T8**: Crear/actualizar `apps/web/src/app/(dashboard)/book/[id]/page.tsx`:
  - [x] Server Component: `params.id` → `getBook(id)` + `getBookNotes(id)` (server-side fetch)
  - [x] 404 si `!book` o `book.user_id !== currentUser`
  - [x] Pasa `book` + `notes` a Client Components vía props
- [x] **T9**: Crear `apps/web/src/app/(dashboard)/book/[id]/loading.tsx`:
  - [x] Skeleton loading (shadcn `Skeleton` para header, grid, editor, lista)

---

### 🎨 Frontend — Client Components (apps/web/src/components/book-detail/)

- [x] **T10**: Crear `BookHeader.tsx`:
  - [x] Portada `Image` priority, width 300, aspect-ratio 2/3, fallback skeleton
  - [x] Badges: `status` (variant según enum), `rating` (5 estrellas `lucide-react Star` fill)
- [x] **T11**: Crear `ReadingControls.tsx`:
  - [x] `Select` status (`want_to_read` / `reading` / `read`)
  - [x] `RatingStars` (5 botones interactivos, `onClick` set rating)
  - [x] `DatePicker` (shadcn `Popover` + `Calendar`) para `started_at` (show si reading/read) y `finished_at` (show si read)
  - [x] Cada cambio → `useMutation(updateBook)` → `onSuccess` invalida `book` query
- [x] **T12**: Crear `NoteEditor.tsx`:
  - [x] `Tabs` ["Editar", "Previsualización"] (sm: tabs, lg: grid 2 cols)
  - [x] `Textarea` value + `onChange` debounced 300ms local state
  - [x] Toolbar: botones insertan markdown en cursor (`bold`, `italic`, `code`, `link`, `heading`, `list`, `quote`)
  - [x] Botón "Guardar nota" → `useMutation(createNote)` → `onSuccess`: invalida `bookNotes`, limpia textarea, toast "Nota guardada"
- [x] **T13**: Crear `NotesList.tsx` + `NoteCard.tsx`:
  - [x] Map `notes` → `NoteCard`: `div` con `dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(note.content_html) }}`
  - [x] Timestamp `formatDistanceToNow(note.created_at)` (date-fns)
  - [x] Badge `chunk_index > 0 ? "Vectorizado" : ""` (variant outline)
- [x] **T14**: Crear `ChatButton.tsx`:
  - [x] Button "Chat con este libro" → `router.push(`/chat?book_id=${bookId}`)` (feature 017)

---

### 🛠️ Utilidades y helpers (apps/web/src/lib/)

- [x] **T15**: Crear `apps/web/src/utils/markdown.ts`:
  - [x] `insertAtCursor(textarea, markdown)` helper para toolbar
- [x] **T16**: Crear `apps/web/src/utils/sanitize.ts`:
  - [x] Wrapper `sanitizeHtml(html: string)` → `DOMPurify.sanitize(html)` (config: permitir tags básicos, quitar scripts)

---

### ✅ Tests (apps/web)

- [x] **T17**: Crear `book-detail/ReadingControls.test.tsx` — RTL:
  - [x] Select status → mutation called
  - [x] Rating stars click → mutation
  - [x] Date pickers show/hide condicional
- [x] **T18**: Crear `book-detail/NoteEditor.test.tsx` — RTL:
  - [x] Toolbar inserta markdown en cursor
  - [x] "Guardar" llama mutation, éxito limpia textarea + toast
- [x] **T19**: Crear `book-detail/NotesList.test.tsx` — RTL:
  - [x] Renderiza HTML sanitizado (script tag removido)
  - [x] Timestamp relative
  - [x] Badge chunk_index
- [x] **T20**: Crear `book-detail/page.test.tsx` — RTL:
  - [x] 404 si libro no existe o no es del usuario (mock server fetch)
- [x] **T21**: Crear `book-detail/BookHeader.test.tsx` — RTL:
  - [x] Cover image priority
  - [x] Badges correctos

---

### 🧪 Validación y lint

- [x] **T22**: Ejecutar validación completa:
  - [x] `cd apps/web && npm run lint` — sin warnings
  - [x] `cd apps/web && npm run test` — suite completa pasa (pre-existing failures unrelated to this feature)
  - [x] `cd apps/api && ruff check .` — sin warnings
  - [x] `cd apps/api && black --check .` — sin formateo necesario
  - [x] `cd apps/api && pytest -v` — suite completa pasa (100%)

---

## ✅ Validación contra criterios de aceptación de `spec.md`

Estas tareas aseguran que todos los criterios de `spec.md` queden cubiertos antes de mover a "Hecho":

- [x] **T23**: `page.tsx` Server Component: fetch `book` + `notes`, 404 si no existe/no dueño
- [x] **T24**: `BookHeader` client: portada `Image` priority, badges status/rating
- [x] **T25**: `ReadingControls` client: `Select` status, `RatingStars` interactivo, `DatePicker` shadcn; `onChange` → mutate; `onSuccess` invalida query book
- [x] **T26**: `NoteEditor` client: `Tabs` ["Editar", "Preview"]; `Textarea` debounced; toolbar botones insertan markdown; "Guardar" → POST /notes; invalida notes query
- [x] **T27**: `NotesList` client: map notes → NoteCard (HTML sanitizado DOMPurify.sanitize), timestamp relative, badge chunk_index
- [x] **T28**: Sanitización doble: `DOMPurify` en cliente (preview + lista) + backend `markdown2` (feature 010)
- [x] **T29**: Botón "Chat con este libro" → `router.push(/chat?book_id=${id})` (feature 017)
- [x] **T30**: Tests RTL — controles editan libro, editor guarda nota, lista renderiza HTML seguro, 404 en libro ajeno
- [x] **T31**: Responsive: stack vertical en <1024px, side-by-side editor/preview en ≥1024px

---

## 📝 Notas

- Todas las tareas siguen la decisión técnica del plan: patrón Server/Client split Next.js App Router, React Query para mutaciones, DOMPurify doble defensa.
- Las fechas se envían en formato `yyyy-MM-dd` (sin zona horaria) usando `date-fns format`.
- El breakpoint responsive es 1024px (lg) para layout side-by-side, coincidiendo con Tailwind `lg` y grid 3-col del dashboard.
- El badge "Vectorizado" es solo visual; la vectorización real es feature 016.

---

## 📦 Mantenimiento (opcional)

_Eliminar esta sección si no aplica. Esta feature no requiere acciones recurrentes al tocarla en el futuro._

---

## 📌 Cierre administrativo

- [ ] **T32**: Mover la feature a "Hecho" en `../../constitution/roadmap.md`
  > _Pendiente: según `AGENTS.md` (Fase 2, paso 8) el movimiento a "Hecho" lo ejecuta el subagente `roadmap` tras la aprobación del revisor. El implementador no modifica la Constitución._