# 026 · Add Book Reload & Dashboard Errors

**Estado:** propuesta

## Qué hace

Arregla el flujo principal de alta de libro y la robustez del dashboard, cubriendo los hallazgos Z2-01…Z2-11 y Z1-01/Z1-02 de la auditoría estática de `apps/web`:

1. **La biblioteca se recarga al añadir un libro.** Hoy, tras un `POST /books` con éxito, el grid no muestra el libro nuevo: `hooks/useAddBook.ts` invalida la query de React Query `["books"]`, pero el grid se alimenta de `lib/hooks/useBooks.ts` (useState/useEffect, sin query registrada), la invalidación es un no-op y nadie llama `router.refresh()`. Se unifica la fuente de datos (migrar `useBooks` a `useQuery` o disparar un refetch/refresh efectivo en el `onSuccess` del alta).
2. **El modal de alta se recupera de errores y se cierra en éxito.** Si `POST /books` falla, el modal queda atrapado en stage "saving" ("Guardando libro…") sin reintento (Z2-02); en éxito no se cierra (Z2-03); y el toast de éxito muestra la clave del botón en vez de un mensaje de confirmación (Z2-04).
3. **El dashboard distingue error de vacío y error de paginación.** Un fallo del fetch inicial se muestra como "biblioteca vacía" (Z1-01); un fallo de "Cargar más" reemplaza todo el grid por ErrorState y borra los libros ya cargados (Z1-02).
4. **Limpieza del flujo de alta:** mapa de errores 400/404/409/500 duplicado entre lookup y create (Z2-05), `aria-controls` apuntando a un id inexistente (Z2-06), hook muerto `useIsbnInput` (Z2-07), doble instancia de AddBookModal (Z2-08), `eslint-disable react-hooks/exhaustive-deps` en el efecto de apertura con ISBN (Z2-09), prop `isLoading` muerta de BookMetadataPreview (Z2-10) y truncado de descripción que mezcla corte por caracteres con line-clamp (Z2-11).

## Por qué

El alta por ISBN es la puerta de entrada a la app (principio de misión: "ISBN como llave maestra") y el dashboard es la pantalla principal. Hoy el flujo está roto de punta a punta: el usuario añade un libro y **no lo ve** (bug reportado, Z2-01, ALTA); si el guardado falla, el modal se queda **congelado** en "Guardando libro…" (Z2-02, ALTA); y si la carga inicial falla, la app miente mostrando "biblioteca vacía" (Z1-01, ALTA). Los fallos de "Cargar más" destruyen datos visibles en pantalla (Z1-02, ALTA). El resto (Z2-03…Z2-11) son fricciones media/baja del mismo flujo que conviene cerrar en la misma pasada para no revisitar este código dos veces. Es la feature más urgente del lote porque afecta al núcleo del producto tal como lo percibe el usuario.

## Criterios de aceptación

**Recarga de biblioteca tras el alta (Z2-01):**

- [ ] Tras un alta con éxito (`POST /books` 201) desde el modal, el libro nuevo aparece en el grid del dashboard **sin recarga manual** del navegador: la invalidación/refetch alcanza al hook que realmente alimenta el grid (migración de `useBooks` a React Query `useQuery` o mecanismo equivalente verificado con test).
- [ ] El alta respeta los filtros activos (búsqueda/status/rating): el libro aparece si coincide con el filtro y el alta no fuerza un reset inesperado del estado visual del dashboard.
- [ ] La primera carga del dashboard sigue renderizando los datos en SSR (seed del Server Component) sin regresiones de hidratación.

**Modal de alta: errores y cierre (Z2-02, Z2-03, Z2-04):**

- [ ] Si `POST /books` falla (400/404/409/500), el modal abandona el stage "saving": vuelve a un estado operativo desde el que se puede **corregir y reintentar** el guardado, con toast de error usando el mensaje mapeado; nunca queda "Guardando libro…" permanente (test con fetch mockeado que rechaza).
- [ ] Tras un fallo del guardado, los metadatos ya buscados (título, autor, portada) **se conservan** en el modal: el usuario no tiene que repetir el lookup.
- [ ] Con éxito, el modal se **cierra** (invoca `onOpenChange(false)` del dialog), no solo resetea estado interno.
- [ ] El toast de éxito usa la clave i18n nueva `addBook.saveSuccess`, definida en **es y en** con textos de confirmación (no la clave del botón `addBook.saveBook`); sin claves huérfanas ni traducciones ausentes.

**Dashboard: error vs vacío vs paginación (Z1-01, Z1-02):**

- [ ] Si el fetch inicial del dashboard falla (red o 5xx), se muestra **ErrorState** con acción de reintento, no EmptyState; un 200 con lista vacía sigue mostrando EmptyState (tests de ambos casos).
- [ ] Si "Cargar más" falla, los libros ya cargados **permanecen visibles**: el error de paginación se comunica de forma no destructiva (toast o banner inline con reintento) y el grid NO se reemplaza por ErrorState (test con fallo simulado en la segunda página).

**Calidad y limpieza del flujo (Z2-05…Z2-11):**

- [ ] El mapa de errores 400/404/409/500 existe **una sola vez** (helper compartido) y lo consumen lookup y create; sin duplicación de mensajes entre ambos caminos.
- [ ] El `aria-controls="book-description"` de BookMetadataPreview apunta a un id **existente** en el DOM (o se elimina si no aplica); verificado con test de render.
- [ ] `hooks/useIsbnInput.ts` se **elimina** (junto a su test) o se integra en el flujo real del modal; no queda código muerto referenciado solo por su test.
- [ ] Existe **una sola** instancia/mecanismo de AddBookModal: EmptyState abre el modal a través del provider controlado; no coexiste una segunda instancia no controlada.
- [ ] No queda ningún `eslint-disable react-hooks/exhaustive-deps` en AddBookModal: el efecto de apertura con ISBN inicial usa dependencias correctas (p. ej. `useCallback`) y `npm run lint` pasa.
- [ ] La prop `isLoading` de BookMetadataPreview se usa de verdad (skeleton visible durante el lookup) o se elimina de la API pública del componente; sin props muertas.
- [ ] El truncado de descripción usa **solo** line-clamp; se elimina el corte por caracteres mezclado.

**Validación:**

- [ ] `cd apps/web && npm run test`, `npm run lint` y `npm run build` en verde tras la feature.

## Fuera de alcance

- **No se modifican las features en "Hecho ✅"** (011/013/014/015) más allá de lo estrictamente especificado por los hallazgos Z2-*/Z1-01/Z1-02: estos son fixes sobre ese código, no rediseños del modal, del grid ni de la UX del alta.
- **No se añaden dependencias**: si se migra `useBooks` a React Query se usa la librería ya presente en la app; `package.json` sin cambios (límite duro de `tech-stack.md`: ninguna dependencia nueva sin justificación).
- **No se añade entrada manual** de libros sin ISBN (misión: ISBN como llave maestra).
- Sincronización de filtros del dashboard con la URL y constante única de page size (Z1-05, Z1-06) → feature **030**.
- Ficha de libro y notas (Z3-*) → feature **027**; navegación/layout (Z5-*, Z1-03, Z1-04) → feature **028**; chat IA (Z4-*) → feature **029**.
- No se toca el backend ni `supabase/migrations/`: los errores ya llegan con el contrato `{ code, message, field? }` de la feature 009.
