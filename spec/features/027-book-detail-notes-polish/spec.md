# 027 · Book Detail & Notes Polish

**Estado:** propuesta

## Qué hace

Corrige la ficha de libro y el editor de notas (hallazgos Z3-01…Z3-13 de la auditoría, salvo Z3-11 que se aborda en la feature 030):

1. **La previsualización de notas renderiza Markdown.** Hoy `NoteEditor.tsx` usa `sanitizeHtml(markdown)` en vez de `renderMarkdownToHtml(markdown)` (`utils/markdown.ts`), y el usuario ve Markdown crudo (`**negrita**`, `# títulos`) donde debería ver texto formateado (Z3-01).
2. **La lista de notas se alimenta de una fuente viva y pagina.** El update optimista escribe en una query `["bookNotes", bookId]` que nadie lee porque la lista llega por props del Server Component (Z3-02); las notas se piden con `page_size=50` fijo y a partir de la 51 desaparecen en silencio (Z3-03); la página redefinía tipos locales y hacía fetch crudo ignorando `getBook`/`getBookNotes` de `lib/api/books.ts` (Z3-04, Z3-05).
3. **La ficha no se rompe con errores de red** (fetch lanza y rompe la página; Z3-07) y el `console.error` se sustituye por un manejo consistente (Z3-06).
4. **Limpieza y a11y:** prop `onNoteCreated` muerta (Z3-08), `content_html` optimista sin convertir Markdown (Z3-09), invalidaciones de query muertas en ReadingControls/BookHeader (Z3-10), estado local de ReadingControls sin re-sincronizar al cambiar `book` (Z3-12) y ArrowRight/ArrowLeft de InteractiveRatingStars con `preventDefault` que no mueve el foco (Z3-13).

## Por qué

La ficha de libro es la segunda pantalla más usada de la app y contiene el editor de notas, pieza central del valor del producto ("toma notas de lectura con soporte Markdown"). Tres defectos dañan la experiencia hoy: la previsualización **no renderiza Markdown** (bug funcional visible en cada uso, Z3-01, ALTA), las notas más allá de la 50 **desaparecen en silencio** (pérdida de datos percibida por el usuario, Z3-03) y la actualización optimista escribe en una query fantasma, con riesgo de estados inconsistentes (Z3-02). Además, un fallo de red rompe la página completa sin UI de error (Z3-07). Cerrar ahora estos hallazgos evita acumular deuda sobre el componente más denso del frontend.

## Criterios de aceptación

**Previsualización de Markdown (Z3-01, Z3-09):**

- [ ] La previsualización del NoteEditor renderiza el Markdown a HTML usando `renderMarkdownToHtml` de `utils/markdown.ts` (con sanitize): al escribir `**negrita**` se ve texto en negrita, no los asteriscos (test de render).
- [ ] El `content_html` optimista (mientras el PUT/POST resuelve) se genera con la misma conversión Markdown→HTML sanitizada, no con `sanitizeHtml` del Markdown crudo.

**Fuente de datos de notas y paginación (Z3-02, Z3-03, Z3-05):**

- [ ] La lista de notas se alimenta de **una sola fuente viva**: la query `["bookNotes", bookId]` es leída por el componente de lista (y el update optimista actúa sobre ella), o el update optimista muerto se elimina si se mantiene el paso por props; en cualquier caso no queda escritura a una query que nadie lee (test lo verifica).
- [ ] Las notas se cargan con paginación real: con más de 50 notas en un libro, la nota 51 y siguientes son visibles mediante "cargar más" (o equivalente); test con 60 notas mockeadas que llega a las 60.
- [ ] `getBook`/`getBookNotes` de `lib/api/books.ts` son la vía única de fetch de la ficha (o se eliminan si se decide lo contrario): la página no duplica fetch crudo y el mock de `page.test.tsx` tiene efecto real sobre lo que se renderiza.

**Tipos y robustez de la ficha (Z3-04, Z3-06, Z3-07):**

- [ ] `BookResponse`/`NotesResponse` se importan de `@/types/book`; sin redefiniciones locales en `book/[id]/page.tsx` (grep sin tipos duplicados).
- [ ] Un fallo de red al cargar la ficha no produce una página rota sin manejo: se captura y deriva a `notFound()` o a un error boundary con UI controlada (test simulando fetch que rechaza).
- [ ] El `console.error` del Server Component se sustituye por la estrategia de error consistente con el resto del proyecto (sin `console.*` directo).

**Limpieza y a11y (Z3-08, Z3-10, Z3-12, Z3-13):**

- [ ] La prop `onNoteCreated` de NoteEditor se usa de verdad o se elimina de su API; sin props muertas.
- [ ] Las invalidaciones de query de ReadingControls/BookHeader apuntan a queries que existen o se eliminan; ninguna invalidación muerta.
- [ ] El estado local de ReadingControls se re-sincroniza cuando cambia el prop `book` (test que cambia `book` y comprueba que status/rating reflejados se actualizan).
- [ ] En InteractiveRatingStars, ArrowRight/ArrowLeft mueven el foco entre las estrellas (o implementan el comportamiento de teclado correcto): el `preventDefault` no deja el foco clavado (test de teclado).

**Validación:**

- [ ] `cd apps/web && npm run test`, `npm run lint` y `npm run build` en verde tras la feature; los tests existentes de book-detail se actualizan donde cambien contratos internos.

## Fuera de alcance

- **No se modifican las features en "Hecho ✅"** (011/013/014/015) más allá de los fixes citados (Z3-*): no hay rediseño de la ficha ni del editor (sin toolbar WYSIWYG, sin preview configurable).
- **No se añaden dependencias**: `utils/markdown.ts` y las utilidades de sanitize ya existen; `package.json` sin cambios (límite duro de `tech-stack.md`: ninguna dependencia nueva sin justificación).
- Páginas de error globales de Next (`error.tsx`, `not-found.tsx`, `global-error.tsx`) → feature **028**; aquí solo el manejo local de la ficha.
- Unificación del primitivo de estrellas (Z3-11) → feature **030**.
- Paginación virtualizada / infinite scroll avanzado: solo una paginación simple suficiente para el criterio (notas ≥51 visibles).
- No se toca el backend ni `supabase/migrations/`: el API de notas (010) ya soporta `page`/`page_size`.
