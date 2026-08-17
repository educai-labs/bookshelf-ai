# 015 · Book Detail / Reading Sheet

**Estado:** propuesta

## Qué hace

Implementa la página `/book/[id]` (route `(dashboard)/book/[id]/page.tsx`) — ficha completa de libro + editor de notas ("Reading Sheet").

Secciones:
1. **Header**: portada grande (300px ancho, aspect-ratio 2/3), título, autor(es), badges status + rating.
2. **Metadatos**: grid 2 cols: editorial, fecha publicación, páginas, ISBN, descripción (expandible).
3. **Controles de lectura** (editable, auto-save on blur / debounce 500ms):
   - Select status: `want_to_read` / `reading` / `read` → `PATCH /api/v1/books/{id}`.
   - Rating: 5 estrellas interactivas (click → set rating) → `PATCH`.
   - Fechas: `started_at` (date picker, solo si `reading` o `read`), `finished_at` (solo si `read`).
4. **Editor de notas** (Markdown):
   - `Textarea` + preview side-by-side (lg+) o tabs (sm) — shadcn `Tabs` + `Textarea` + `div` con `dangerouslySetInnerHTML` (sanitizado `DOMPurify`).
   - Toolbar básica: bold, italic, code, link, heading, lista, quote (botones insertan markdown).
   - Botón "Guardar nota" → `POST /api/v1/books/{id}/notes` → tras éxito: añade a lista notas, limpia editor, toast "Nota guardada".
5. **Lista de notas guardadas**: orden `created_at DESC`, cada nota: contenido renderizado (HTML sanitizado), timestamp relativo ("hace 2h"), `chunk_index` badge si vectorizada (feature 016).
6. **Botón "Chat con este libro"**: navega a chat IA con `book_id` preseleccionado (feature 017).

Data: Server Component fetch inicial `GET /books/{id}` + `GET /books/{id}/notes`. Client components para controles/editor.

## Por qué

Ficha de libro es el centro de la experiencia de lectura: metadatos, progreso, notas y chat contextual. Auto-save evita pérdida. Editor Markdown + preview es estándar para notas técnicas/literarias. Lista notas muestra historial de pensamiento.

## Criterios de aceptación

- [ ] `src/app/(dashboard)/book/[id]/page.tsx` Server Component: `params.id` → fetch `book` + `notes` (server client), 404 si no existe/no dueño.
- [ ] `BookHeader` client: portada `Image` priority, badges status/rating.
- [ ] `ReadingControls` client: `Select` status, `RatingStars` interactivo, `DatePicker` (shadcn `Popover` + `Calendar`) para fechas; `onChange` → `mutate` (React Query) `PATCH /books/{id}`; `onSuccess` invalida query book.
- [ ] `NoteEditor` client: `Tabs` ["Editar", "Preview"]; `Textarea` con `onChange` debounced local; toolbar botones insertan markdown en cursor; "Guardar" → `POST /notes` → `onSuccess` invalida `notes` query, limpia textarea.
- [ ] `NotesList` client: map `notes` → `NoteCard` (HTML sanitizado `DOMPurify.sanitize`), timestamp `formatDistanceToNow`, badge `chunk_index` (si >0: "Vectorizado").
- [ ] Sanitización: `DOMPurify` en cliente (preview + lista) + backend `markdown2` (feature 010) — doble defensa.
- [ ] Botón "Chat con este libro" → `router.push(\`/chat?book_id=${id}\`)` (feature 017 define ruta chat).
- [ ] Tests: RTL — controles editan libro, editor guarda nota, lista renderiza HTML seguro, 404 en libro ajeno.
- [ ] Responsive: stack vertical en <1024px, side-by-side editor/preview en ≥1024px.

## Fuera de alcance

- Chat IA (feature 017).
- Vectorización de notas (feature 016) — solo badge visual.
- Edición/borrado de notas individuales — feature futura.
- Exportar notas (PDF, Markdown) — feature futura.
- Anotaciones en portada / páginas específicas — feature futura.