# 030 · Visual Consistency Polish — Plan

## Enfoque

Se centralizarán las decisiones visuales y la paginación del listado en módulos
pequeños del frontend, manteniendo las APIs públicas de los componentes cuando
sea posible. El dashboard tratará la URL como fuente de verdad para sus tres
filtros: el Server Component la usará para el seed inicial y `LibraryGrid` la
sincronizará con el estado cliente mediante las APIs de navegación de Next.js.
Los cambios son únicamente de frontend, sin dependencias nuevas, migraciones ni
alteraciones del modelo de datos.

## Implementación

1. Crear un módulo común de paginación en `apps/web/src/lib/constants/pagination.ts` con la única constante `PAGE_SIZE = 20`; reemplazar `DASHBOARD_PAGE_SIZE` en `apps/web/src/lib/books/seed.ts` y `DEFAULT_PAGE_SIZE` en `apps/web/src/lib/hooks/useBooks.ts`, conservando los tamaños independientes de las notas.
2. Añadir en `apps/web/src/lib/books/filters.ts` la serialización y validación de `BookFilters` para `q`, `status` y `rating` (omitir valores por defecto y descartar valores inválidos). Modificar `apps/web/src/app/(dashboard)/dashboard/page.tsx` para aceptar `searchParams`, convertirlos a filtros iniciales y pasarlos tanto a `getInitialBooks` como a `LibraryGrid`.
3. Actualizar `apps/web/src/components/dashboard/LibraryGrid.tsx` para inicializarse desde la query actual, reflejar los cambios de búsqueda/status/rating en la URL sin recarga dura y reaccionar a cambios de `useSearchParams` (incluido historial atrás/adelante). Mantener la carga y el debounce existentes, evitando que una actualización de URL reintroduzca filtros no válidos o pierda los valores por defecto.
4. Crear el mapa compartido de estado y el componente de badge en `apps/web/src/components/book/StatusBadge.tsx` (o módulo equivalente de `components/book`), incluyendo etiquetas i18n, variante y clases para `want_to_read`, `reading` y `read`. Sustituir los mapas y el badge inline de `apps/web/src/components/dashboard/BookCard.tsx` y `apps/web/src/components/book-detail/BookHeader.tsx` por ese componente, preservando la apariencia existente.
5. Extraer el dibujo, tamaños y colores de estrella a un único primitivo en `apps/web/src/components/book/StarRating.tsx`; adaptar `apps/web/src/components/book/RatingStars.tsx` y `apps/web/src/components/book-detail/InteractiveRatingStars.tsx` para reutilizarlo con modos readonly/interactivo. Reemplazar las estrellas inline de `BookHeader` por `RatingStars` o la composición del mismo primitivo, fijando tamaños coherentes y conservando la semántica ARIA y la interacción existente.
6. Convertir `apps/web/src/components/dashboard/BookCard.tsx` en un card navegable mediante `Link` de Next.js con `href={`/book/${book.id}`}` (sin `router.push` ni `onClick` de navegación), ajustando `apps/web/src/components/dashboard/LibraryGrid.tsx` y sus tipos/tests para retirar el callback. En el mismo componente, mostrar `t("book.unknownAuthor")` cuando `authors` esté vacío.
7. Actualizar los tests junto a los módulos afectados (`apps/web/src/components/dashboard/__tests__/BookCard.test.tsx`, tests de `BookHeader`, `RatingStars`, `InteractiveRatingStars`, dashboard y nuevos tests de filtros/status/estrella) para cubrir: constante única, round-trip de query params y defaults, restauración por historial, fallback i18n, paridad de badges, tamaños/primitivo único y anchor con href real.
8. Ejecutar desde `apps/web` `npm run test`, `npm run lint` y `npm run build`; corregir cualquier regresión de tipos, hidratación o navegación antes de dar la feature por terminada.

## Decisiones

- **La URL es la fuente de verdad de los filtros** — permite refresh, enlaces compartidos y restauración con atrás/adelante; se usan `searchParams`, `useSearchParams` y `router` de Next.js en lugar de una librería o estado global.
- **Una constante común para el listado de libros** — `PAGE_SIZE` vive en `lib/constants` y es importada por SSR y `useBooks`; los tamaños de paginación de notas no se mezclan porque representan otro recurso y siguen siendo 50.
- **Badge y configuración de estado compartidos** — un componente común garantiza paridad de variante/clases entre dashboard y detalle; se descartan mapas locales y un rediseño del sistema shadcn.
- **Primitivo único de estrellas con modos readonly/interactivo** — centraliza SVG, color y escala sin romper las props especializadas de los dos consumidores actuales; no se añade una dependencia de iconos ni se mantienen estrellas inline.
- **`Link` semántico para BookCard** — habilita prefetch y menú contextual del navegador; se descarta conservar `role="button"` con `router.push`, porque no produce un anchor real.
- **Historial explícito para cambios de filtros** — las transiciones de filtros se escriben con navegación cliente y los cambios externos de `searchParams` vuelven a hidratar el estado; los valores por defecto se representan omitiendo sus parámetros.

## Riesgos

- **Desfase entre seed SSR y filtros cliente** — parsear los mismos parámetros con un helper compartido y pasar exactamente esos filtros a `getInitialBooks` y `LibraryGrid`; añadir tests de hidratación con query inicial.
- **Actualizaciones de búsqueda excesivas o historial ruidoso** — conservar el debounce de `useBooks`, serializar valores normalizados y evitar navegar cuando la query resultante no cambia; verificar back/forward con un router mockeado.
- **Valores inválidos en URLs compartidas** — validar status y rating antes de construir `BookFilters`, ignorar parámetros desconocidos y volver a los defaults sin lanzar excepciones.
- **Regresión de accesibilidad al pasar de card clicable a anchor o al unificar estrellas** — conservar nombres accesibles, foco visible, roles ARIA y navegación de teclado; cubrirlos en RTL.
- **Diferencias visuales al reemplazar badges/estrellas existentes** — derivar las clases del comportamiento actual, añadir tests de paridad para los tres estados y ejecutar lint/build además de la suite.
