# 026 · Add Book Reload & Dashboard Errors — Plan

## Enfoque

Unificar el origen de datos del dashboard con React Query, aprovechando la
dependencia ya instalada y las claves de query que ya usa la mutación de alta.
`useBooks` conservará la semántica actual de filtros con debounce, paginación y
seed SSR, pero expondrá por separado el error de la primera página y el de
"Cargar más" para que una página adicional fallida no destruya los datos
visibles. La invalidación de `['books']` tras un alta alcanzará así la query que
alimenta realmente el grid, respetando los filtros activos.

El flujo del modal seguirá siendo controlado por el provider y mantendrá los
metadatos en memoria durante un fallo de guardado. Se extraerá el mapeo de
errores HTTP compartido y se limpiarán los problemas de accesibilidad,
dependencias y props muertas sin modificar el backend ni añadir dependencias.

## Implementación

1. Revisar las claves de traducción y añadir `addBook.saveSuccess` en las
   variantes española e inglesa, además de las copias necesarias para el error
   no destructivo de paginación y reintento si el diseño elegido las requiere,
   en `apps/web/src/lib/i18n/dictionaries.ts`. Verificar que todas las claves
   consumidas existan en ambos diccionarios.
2. Extraer a un helper compartido del cliente (por ejemplo,
   `apps/web/src/lib/api/errors.ts`) la conversión de los estados 400/404/409/500
   y del fallback genérico a las claves/mensajes de alta. Hacer que tanto
   `apps/web/src/hooks/useAddBook.ts` como el lookup de
   `apps/web/src/components/books/AddBookModal.tsx` consuman ese helper, sin
   duplicar el mapa de mensajes, y cubrirlo con tests unitarios.
3. Migrar el motor de `apps/web/src/lib/hooks/useBooks.ts` a las APIs de React
   Query ya presentes (query/infinite query según la forma que preserve mejor
   el contrato actual), usando una clave que incluya filtros efectivos y tamaño
   de página. Mantener el debounce de búsqueda, el append ordenado, el total,
   `hasMore`, `retry` y el seed de `initialBooks`/`initialTotal` como datos
   iniciales de la primera página para conservar el render SSR y evitar un
   flash de skeleton. Hacer que la query sea invalidable por el prefijo
   `['books']` y que la invalidación/refetch tras crear un libro no resetee los
   filtros ni su estado visual.
4. Separar en `useBooks` el error de carga inicial del error de paginación:
   limpiar el error de primera página al reintentar o cambiar filtros, conservar
   `books` cuando falla `loadMore`, exponer el error de página adicional y una
   acción de reintento específica, y no tratar un error de paginación como si
   fuera un error global. Mantener el contrato público compatible donde no sea
   necesario y actualizar sus tests junto al hook.
5. Ajustar `apps/web/src/components/dashboard/LibraryGrid.tsx` para mostrar
   `ErrorState` únicamente cuando falla la primera carga y mostrar un aviso
   inline/toast con reintento cuando falla `loadMore`, manteniendo el grid,
   contador y libros ya cargados. Confirmar que un 200 con `items=[]` se dirige
   a `EmptyState`, mientras que red/5xx inicial va a `ErrorState` con acción de
   retry. Añadir/actualizar tests de ambos estados y de fallo en la segunda
   página.
6. Completar `apps/web/src/hooks/useAddBook.ts` para que el éxito invalide el
   prefijo de libros, use `t('addBook.saveSuccess')` y notifique el cierre al
   modal. En el error, dejar que el componente vuelva a `preview` (o estado
   operativo equivalente) en lugar de permanecer en `saving`, conservar
   `lookupData`/`lookupIsbn` y permitir corregir o reintentar sin repetir el
   lookup. Actualizar `apps/web/src/components/books/AddBookModal.tsx` y sus
   tests con mocks de fetch/mutación para 400/404/409/500, rechazo, reintento,
   conservación de metadatos y `onOpenChange(false)` en éxito.
7. Corregir el efecto de apertura con ISBN inicial en
   `apps/web/src/components/books/AddBookModal.tsx` mediante dependencias
   completas y una función estable (`useCallback` cuando sea necesario),
   eliminando el `eslint-disable react-hooks/exhaustive-deps`. Mantener el
   comportamiento de lookup automático solo al abrir con ISBN y evitar
   lookups repetidos por renders posteriores.
8. Hacer que `EmptyState` abra el modal mediante `useAddBookModal().openAddBook`
   en vez de renderizar otra instancia de `AddBookModal`; conservar el botón y
   su test. Verificar que el provider de
   `apps/web/src/components/books/AddBookModalProvider.tsx` queda como única
   instancia controlada para header, estado vacío y sugerencias.
9. Limpiar `apps/web/src/components/book/BookMetadataPreview.tsx`: usar
   `isLoading` desde el flujo de lookup para renderizar el skeleton real (o
   eliminarlo de la API si el flujo no lo necesita), dar al texto de descripción
   un id `book-description` existente y eliminar el corte por caracteres y sus
   constantes/estilos asociados, dejando únicamente `line-clamp` para el
   estado contraído. Actualizar sus tests de skeleton, accesibilidad y
   expansión; eliminar `apps/web/src/hooks/useIsbnInput.ts` y
   `apps/web/src/hooks/useIsbnInput.test.ts` si la búsqueda integrada es la
   única ruta real y confirmar que no quedan importaciones.
10. Actualizar los tests de `useBooks`, `useAddBook`, `LibraryGrid`,
    `AddBookModal`, `EmptyState` y `BookMetadataPreview` con React Testing
    Library/Vitest, incluyendo filtros activos durante la invalidación, seed
    SSR/hidratación lógica, éxito 201, errores iniciales/paginación y
    ausencia de duplicación del modal. Ejecutar desde `apps/web` `npm run test`,
    `npm run lint` y `npm run build`, corrigiendo cualquier warning o regresión
    de tipado antes de dar la feature por terminada.

## Decisiones

- **React Query como fuente única para libros** — La app ya usa
  `@tanstack/react-query` para el alta y la invalidación por `['books']`; migrar
  el hook existente evita eventos globales o `router.refresh()` como mecanismo
  paralelo y hace verificable que el alta refresca el grid. Se descarta
  mantener el `useState`/`useEffect` independiente porque la invalidación sería
  un no-op y se perdería la garantía de recarga.
- **Separar error inicial y error de paginación** — Un fallo de la primera
  página impide representar una biblioteca fiable y debe activar `ErrorState`,
  pero un fallo posterior no invalida los libros ya cargados. Se descarta
  reutilizar una única variable `error` que reemplace el grid completo.
- **Preservar seed SSR como datos iniciales** — El Server Component sigue
  entregando la primera página para el primer render; React Query hará el
  refresco silencioso posterior. Se descarta convertir la pantalla en un fetch
  exclusivamente cliente porque introduciría regresiones de hidratación y
  skeleton flash.
- **Helper único para errores HTTP** — Lookup y create comparten contrato y
  mensajes, por lo que el mapeo vive en una utilidad de frontend reutilizable.
  Se descarta corregir cada `catch` por separado, que permitiría que vuelvan a
  divergir los mensajes 400/404/409/500.
- **Provider controlado como única instancia del modal** — El provider ya
  ofrece un mecanismo de apertura desde cualquier superficie; `EmptyState` lo
  usará igual que header y sugerencias. Se descarta conservar el trigger local
  porque crea dos instancias y estados de diálogo potencialmente divergentes.
- **Line-clamp sin truncado de texto** — El truncado visual CSS controla la
  presentación sin perder contenido ni mezclar dos límites incompatibles. Se
  descarta `slice(0, 200)` más `line-clamp`, que produce cortes artificiales y
  puede dejar el control `aria-controls` apuntando a un elemento inexistente.

## Riesgos

- **La migración de `useBooks` puede cambiar estados de carga o hidratación** —
  Mantener explícitamente la semántica de seed, filtros estabilizados y
  cancelación/reintentos; cubrir primer render, cambio de filtros y build con
  tests antes de retirar el hook anterior.
- **La invalidación podría eliminar temporalmente resultados bajo filtros** —
  Conservar la clave de filtros en la query y usar refetch/invalidation sin
  resetear el estado de filtros; probar alta con búsqueda, status y rating que
  coinciden y que no coinciden.
- **Un error de paginación podría volver a contaminar el estado global** —
  Mantener el error de `loadMore` separado del error inicial y renderizar el
  aviso solo junto al grid; añadir una prueba que compruebe que los IDs de la
  primera página siguen presentes tras el fallo.
- **El callback de error de la mutación puede dejar el stage del modal fuera de
  sincronía** — Coordinar `isPending`/error con un callback explícito al
  componente o un efecto controlado, conservar `lookupData` y verificar un
  segundo `mutate` sin repetir lookup en tests.
- **Eliminar `useIsbnInput` o la instancia de `EmptyState` puede romper
  imports o tests indirectos** — Buscar todas las referencias antes de borrar,
  actualizar los tests de integración del provider y ejecutar lint, suite y
  build completos.
- **Cambios de i18n pueden dejar claves ausentes en un idioma** — Añadir la
  clave de éxito en ambos diccionarios y comprobar que no quedan referencias a
  claves de botón para el toast ni claves huérfanas.
