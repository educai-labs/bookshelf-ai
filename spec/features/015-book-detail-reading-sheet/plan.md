# Plan de implementación — 015 Book Detail / Reading Sheet

## Enfoque

Implementar la página de detalle de libro (`/book/[id]`) como **Server Component** que hace fetch inicial de `book` + `notes` vía API backend, y compone **Client Components** interactivos para controles de lectura, editor de notas Markdown y lista de notas. El patrón Server/Client split sigue Next.js App Router: datos en servidor, interactividad en cliente. Auto-save en controles usa React Query mutations (`PATCH /books/{id}`) con invalidación de query; editor de notas usa `POST /books/{id}/notes` con limpieza tras éxito. Sanitización HTML doble: `DOMPurify` en cliente (preview + lista) y `markdown2` en backend (feature 010). Responsive: stack vertical <1024px, side-by-side editor/preview ≥1024px.

## Implementación

### 1. Backend — Endpoints API (apps/api)

| Paso | Archivo / Módulo | Acción |
|------|------------------|--------|
| 1.1 | `apps/api/app/api/v1/books.py` | Verificar/añadir `GET /books/{id}` (retorna book + notes opcional) y `PATCH /books/{id}` (status, rating, started_at, finished_at). Validación Pydantic: `BookUpdate` con campos opcionales, enum `book_status`, rating 1-5, fechas date. |
| 1.2 | `apps/api/app/api/v1/notes.py` | Verificar/añadir `GET /books/{id}/notes` (orden `created_at DESC`, incluye `chunk_index`) y `POST /books/{id}/notes` (body: `content` markdown → retorna note creada con `content_html` renderizado via `markdown2` + sanitizado). |
| 1.3 | `apps/api/app/models/book.py` | Añadir/verificar schemas `BookResponse`, `BookUpdate`, `NoteCreate`, `NoteResponse`. |
| 1.4 | `apps/api/app/services/notes.py` | Helper `render_markdown_to_html(content: str) -> str` usando `markdown2` + `bleach`/`DOMPurify` equivalent para sanitizar HTML generado. |

### 2. Frontend — Types & API Client (apps/web)

| Paso | Archivo / Módulo | Acción |
|------|------------------|--------|
| 2.1 | `apps/web/src/types/book.ts` | Definir `Book`, `BookStatus`, `Note`, `BookUpdate`, `NoteCreate` (camelCase). |
| 2.2 | `apps/web/src/lib/api/books.ts` | Funciones `getBook(id)`, `updateBook(id, data)`, `getBookNotes(id)`, `createNote(bookId, content)` usando `fetch` con headers auth + manejo errores tipado. |
| 2.3 | `apps/web/src/lib/queryKeys.ts` | Keys: `book(id)`, `bookNotes(id)` para React Query. |

### 3. Frontend — Server Component Page (apps/web)

| Paso | Archivo / Módulo | Acción |
|------|------------------|--------|
| 3.1 | `apps/web/src/app/(dashboard)/book/[id]/page.tsx` | Server Component: `params.id` → `await getBook(id)` + `await getBookNotes(id)` (server-side fetch con Supabase service role o API call). 404 si `!book` o `book.user_id !== currentUser`. Pasa `book` + `notes` a Client Components vía props. |
| 3.2 | `apps/web/src/app/(dashboard)/book/[id]/loading.tsx` | Skeleton loading (shadcn `Skeleton` para header, grid, editor, lista). |

### 4. Frontend — Client Components (apps/web/src/components/book-detail/)

| Paso | Componente | Detalles |
|------|------------|----------|
| 4.1 | `BookHeader.tsx` | `Image` priority, width 300, aspect-ratio 2/3, fallback skeleton. Badges: `status` (variant según enum), `rating` (5 estrellas `lucide-react Star` fill). |
| 4.2 | `ReadingControls.tsx` | `Select` status (want_to_read/reading/read), `RatingStars` (5 botones interactivos, `onClick` set rating), `DatePicker` (shadcn `Popover` + `Calendar`) para `started_at` (show si reading/read) y `finished_at` (show si read). Cada cambio → `useMutation(updateBook)` → `onSuccess` invalida `book` query. |
| 4.3 | `NoteEditor.tsx` | `Tabs` ["Editar", "Previsualización"] (sm: tabs, lg: grid 2 cols). `Textarea` value + `onChange` debounced 300ms local state. Toolbar: botones insertan markdown en cursor (`insertAtCursor` helper: bold `**`, italic `*`, code `` ` ``, link `[text](url)`, heading `## `, list `- `, quote `> `). Botón "Guardar nota" → `useMutation(createNote)` → `onSuccess`: invalida `bookNotes`, limpia textarea, toast "Nota guardada". |
| 4.4 | `NotesList.tsx` + `NoteCard.tsx` | Map `notes` → `NoteCard`: `div` con `dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(note.content_html) }}`, timestamp `formatDistanceToNow(note.created_at)` (date-fns), badge `chunk_index > 0 ? "Vectorizado" : ""` (variant outline). |
| 4.5 | `ChatButton.tsx` | Button "Chat con este libro" → `router.push(`/chat?book_id=${bookId}`)` (feature 017). |

### 5. Utilidades y helpers (apps/web/src/lib/)

| Paso | Archivo | Acción |
|------|---------|--------|
| 5.1 | `utils/markdown.ts` | `insertAtCursor(textarea, markdown)` helper para toolbar. |
| 5.2 | `utils/sanitize.ts` | Wrapper `sanitizeHtml(html: string)` → `DOMPurify.sanitize(html)` (config: permitir tags básicos markdown, quitar scripts). |

### 6. Tests (apps/web)

| Paso | Archivo | Qué testea |
|------|---------|------------|
| 6.1 | `book-detail/ReadingControls.test.tsx` | RTL: select status → mutation called, rating stars click → mutation, date pickers show/hide condicional. |
| 6.2 | `book-detail/NoteEditor.test.tsx` | Toolbar inserta markdown en cursor, "Guardar" llama mutation, éxito limpia textarea + toast. |
| 6.3 | `book-detail/NotesList.test.tsx` | Renderiza HTML sanitizado (script tag removido), timestamp relative, badge chunk_index. |
| 6.4 | `book-detail/page.test.tsx` | 404 si libro no existe o no es del usuario (mock server fetch). |
| 6.5 | `book-detail/BookHeader.test.tsx` | Cover image priority, badges correctos. |

### 7. Validación y lint

| Paso | Comando |
|------|---------|
| 7.1 | `cd apps/web && npm run lint` |
| 7.2 | `cd apps/web && npm run test` |
| 7.3 | `cd apps/api && ruff check . && black --check .` |
| 7.4 | `cd apps/api && pytest -v` |

## Decisiones

| Tema | Decisión | Justificación |
|------|----------|---------------|
| Server vs Client split | Page = Server Component; controles/editor/lista = Client Components | Next.js App Router best practice: fetch en servidor, hidratación mínima. Evita waterfall y reduce bundle cliente. |
| React Query para mutaciones | `useMutation` + `queryClient.invalidateQueries` | Cache coherente, retry automático, loading/error states built-in. |
| DOMPurify en cliente | `DOMPurify.sanitize` en preview y NoteCard | Doble defensa: backend sanitiza al guardar, cliente sanitiza al renderizar. Previene XSS si backend falla o datos vienen de otra fuente. |
| Toolbar Markdown simple | Botones insertan sintaxis en cursor (no editor WYSIWYG) | Ligero, sin dependencias pesadas (TipTap, ProseMirror). Cumple criterios: bold, italic, code, link, heading, lista, quote. |
| DatePicker | shadcn `Popover` + `Calendar` | Consistencia con design system, accesible, ya en deps. |
| Rating stars | 5 botones `lucide-react Star` + `onClick` | Simple, accesible (botones), sin librería extra. |
| Chunk badge visual only | `chunk_index > 0 ? "Vectorizado" : ""` | Feature 016 hará vectorización; aquí solo badge informativo. |
| Responsive breakpoint | 1024px (lg) para side-by-side editor/preview | Coincide con Tailwind `lg` y dashboard grid 3-col. |

## Riesgos

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| Server fetch falla (auth, network) | Página 500/blank | `try/catch` en page.tsx → `notFound()` o redirect login. Error boundary en layout. |
| DOMPurify no cargado en SSR | `ReferenceError: window` | Import dinámico `const DOMPurify = (await import('dompurify')).default` solo en Client Components. |
| Race condition auto-save | Último write gana, pero UI parpadea | React Query `onMutate` optimistic update para status/rating; notas no tienen auto-save (solo botón guardar). |
| Markdown sanitization inconsistency | Backend `markdown2` + `bleach` vs cliente `DOMPurify` | Configurar ambas con misma whitelist (tags: p, strong, em, code, pre, a, h1-6, ul, ol, li, blockquote, br). Test cross-check. |
| DatePicker zona horaria | Fechas guardadas en UTC vs local | Usar `date-fns` `format(date, 'yyyy-MM-dd')` para envío; backend espera `date` (sin TZ). |
| Libro ajeno accesible por ID | Fuga de datos | Server Component verifica `book.user_id === session.user.id` antes de renderizar. 404 si no match. |
| Dependencia `dompurify` tamaño bundle | +~20KB gzipped | Acceptable para seguridad; alternativa `isomorphic-dompurify` si SSR necesario (no aquí, solo cliente). |

---