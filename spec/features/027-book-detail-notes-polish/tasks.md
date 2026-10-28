---
estado: "hecho"
---

# 027 · Book Detail & Notes Polish — Tareas

- [x] Extender los tipos compartidos de `apps/web/src/types/book.ts` para conservar `total`, `page` y `page_size` en la respuesta paginada de notas.
- [x] Actualizar `apps/web/src/lib/api/books.ts` para que `getBook` acepte un token de sesión opcional y resuelva la URL configurada sin fetch crudo duplicado.
- [x] Actualizar `apps/web/src/lib/api/books.ts` para que `getBookNotes` acepte token, `page` y `page_size`, manteniendo `ApiError` como error tipado.
- [x] Reemplazar los tipos y helpers locales de `book/[id]/page.tsx` por los tipos compartidos de `@/types/book`.
- [x] Cambiar `book/[id]/page.tsx` para cargar la ficha exclusivamente mediante `getBook` y `getBookNotes`, pasando la primera respuesta paginada al cliente.
- [x] Añadir en `book/[id]/page.tsx` el manejo controlado de ausencia de usuario/sesión, 404 y fallos de red mediante `notFound()`, sin `console.*` directo.
- [x] Cambiar `BookDetailClient.tsx` y `NotesList.tsx` para leer la lista desde una única query `['bookNotes', bookId]`.
- [x] Inicializar la query de notas con la primera respuesta paginada recibida del Server Component y conservar una forma compatible con `useInfiniteQuery`.
- [x] Implementar en `NotesList.tsx` la paginación explícita mediante un control accesible de “cargar más” hasta alcanzar `total`.
- [x] Verificar que la lista muestra las 60 notas del escenario paginado y que mantiene correctamente el estado vacío cuando no existen notas.
- [x] Usar el `total` de la respuesta paginada para el contador de notas de la ficha.
- [x] Actualizar `NoteEditor.tsx` para usar `renderMarkdownToHtml` en la previsualización debounced y mantener la sanitización antes de `dangerouslySetInnerHTML`.
- [x] Generar con `renderMarkdownToHtml` el `content_html` de la nota optimista del editor.
- [x] Adaptar el update optimista, rollback e invalidación de `NoteEditor.tsx` a la forma paginada de la query `['bookNotes', bookId]`.
- [x] Eliminar la prop `onNoteCreated` y su callback cuando no existan consumidores.
- [x] Eliminar de `ReadingControls.tsx` y `BookHeader.tsx` las invalidaciones de queries inexistentes, conservando `router.refresh()`.
- [x] Añadir en `ReadingControls.tsx` la resincronización de status, rating y fechas locales cuando cambie el prop `book`, sin alterar el rollback.
- [x] Implementar en `InteractiveRatingStars.tsx` refs para los cinco botones y navegación de foco con ArrowRight/ArrowLeft, incluidos los extremos.
- [x] Verificar que `InteractiveRatingStars.tsx` solo aplica `preventDefault` al mover el foco y conserva roles ARIA y activación con Enter/Espacio.
- [x] Actualizar `NoteEditor.test.tsx` para cubrir render Markdown y `content_html` optimista sanitizado.
- [x] Añadir o actualizar pruebas de `NotesList`/`BookDetailClient` para la query viva, la paginación de 60 notas y el control de cargar más.
- [x] Actualizar `page.test.tsx` para mockear efectivamente `getBook`/`getBookNotes` y cubrir el rechazo de la carga que deriva a `notFound()`.
- [x] Actualizar `ReadingControls.test.tsx` para comprobar la resincronización al cambiar `book`.
- [x] Añadir una prueba de teclado de `InteractiveRatingStars` para ArrowRight/ArrowLeft y activación con Enter/Espacio.
- [x] Actualizar los fixtures y contratos de los tests existentes de book-detail afectados por los metadatos paginados.
- [x] Ejecutar `cd apps/web && npm run test` y corregir cualquier fallo de la suite.
- [x] Ejecutar `cd apps/web && npm run lint` y corregir cualquier warning o error de lint.
- [x] Ejecutar `cd apps/web && npm run build` y corregir cualquier error de compilación.
- [x] Actualizar documentación si aplica.
- [x] Validar contra los criterios de aceptación de `spec.md`.
- [x] Mover la feature a "Hecho" en `../../constitution/roadmap.md`.
