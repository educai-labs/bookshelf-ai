# 030 · Visual Consistency Polish

**Estado:** propuesta

## Qué hace

Unifica la consistencia visual y elimina duplicación transversal del frontend (hallazgos Z1-05…Z1-09 y Z3-11 de la auditoría):

1. **Constante única de page size:** `PAGE_SIZE = 20` (dashboard SSR) y `DEFAULT_PAGE_SIZE = 20` (`useBooks`) duplicadas (Z1-05).
2. **Filtros en la URL:** los filtros del dashboard (búsqueda, status, rating) viven solo en useState; al recargar, compartir o bookmarkear se pierden, y "atrás" no los restaura (Z1-06).
3. **Fallback de autores:** `book.authors.join(", ")` sin fallback en BookCard mientras BookHeader usa `unknownAuthor` (Z1-07).
4. **Mapa único de badges de estado:** el mapeo status→color difiere entre BookCard y BookHeader (mismo libro, distinto color según la vista) (Z1-08).
5. **BookCard navegable con `<Link>`:** usa `onClick` + `router.push`, perdiendo el prefetch de Next y el "abrir en pestaña nueva" (Z1-09).
6. **Un solo primitivo de estrellas:** tres implementaciones (inline en BookHeader, RatingStars, InteractiveRatingStars) con tamaños distintos (Z3-11).

## Por qué

La consistencia visual es la última capa de calidad percibida: hoy el mismo libro se ve distinto en el dashboard y en su ficha (badges con colores diferentes según la vista, estrellas con tamaños distintos, autores vacíos renderizados como texto hueco en un sitio y con fallback en otro). Además, la UX de filtrado es frágil: un refresh o un enlace compartido pierde el estado del dashboard porque los filtros no viven en la URL. Son hallazgos de severidad baja/media, ideales para cerrar en una pasada final de pulido una vez que las features 026–029 hayan arreglado lo funcional. Cierra también deuda de duplicación (constantes, badges, estrellas) que encarece todo cambio visual futuro.

## Criterios de aceptación

**Constantes y filtros en URL (Z1-05, Z1-06):**

- [ ] Una única constante de page size compartida (módulo común): ni el dashboard SSR ni `useBooks` definen la suya propia (grep: cero definiciones duplicadas de page size).
- [ ] Los filtros del dashboard (búsqueda, status, rating) se reflejan en la URL (`useSearchParams`/router): cambiar un filtro actualiza la query string sin recarga dura; recargar la página con query params restaura el estado exacto de los filtros.
- [ ] El botón "Atrás" del navegador restaura el estado de filtros anterior (test de navegación con historial mockeado).
- [ ] La primera visita sin query params muestra los valores por defecto actuales (sin regresión de comportamiento).

**Consistencia visual (Z1-07, Z1-08, Z3-11):**

- [ ] BookCard muestra el mismo fallback i18n que BookHeader (`unknownAuthor` o equivalente es/en) cuando `authors` está vacío (test con `authors: []`).
- [ ] Un único mapa status→variant/classes compartido: BookCard y BookHeader renderizan el mismo badge (mismo color/clase) para cada estado (`want_to_read`, `reading`, `read`) — test de paridad entre ambas vistas.
- [ ] Un único primitivo de estrellas (con prop `interactive?` o composición equivalente) usado por BookHeader, RatingStars e InteractiveRatingStars: tamaños coherentes en las tres ubicaciones y cero implementaciones inline divergentes (grep sin estrellas inline duplicadas).

**Navegación de BookCard (Z1-09):**

- [ ] BookCard navega mediante `<Link href="/book/{id}">` (no `onClick` + `router.push`): el card renderiza un anchor real con el href del libro (test), habilitando el prefetch de Next y el "abrir en pestaña nueva" del menú contextual del navegador.

**Validación:**

- [ ] `cd apps/web && npm run test`, `npm run lint` y `npm run build` en verde tras la feature.

## Fuera de alcance

- **No se modifican las features en "Hecho ✅"** (011/013/014/015) más allá de los fixes citados: no hay rediseño del sistema de diseño ni cambios de tema/colores de shadcn (solo unificar lo existente).
- **No se añaden dependencias**: la sincronización con la URL usa las APIs de Next.js ya disponibles; `package.json` sin cambios (límite duro de `tech-stack.md`: ninguna dependencia nueva sin justificación).
- Filtros nuevos (por autor, ordenación, facetas): no se añaden filtros, solo se persisten los existentes.
- Rediseño del grid responsivo, ajustes de dark mode y animaciones.
- Fixes de funcionalidad (recarga tras alta, errores de dashboard, notas, chat, navegación) → features **026–029**.
- No se toca el backend ni `supabase/migrations/`.
