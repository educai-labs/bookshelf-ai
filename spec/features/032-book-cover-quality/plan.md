# 032 · Book Cover Quality — Plan

## Enfoque

Corregir la selección y normalización de URLs en el servicio compartido de ISBN,
sin cambiar los modelos Pydantic, los endpoints ni la UI. Así, el lookup, el alta
de libros y las sugerencias reciben la misma portada de mayor resolución de forma
automática. Después se añadirá un comando de backfill administrativo, ejecutado
con el cliente `service_role`, que relea únicamente el ISBN13 y actualiza solo
`cover_url` cuando obtiene una portada mejor o disponible.

El backfill será fail-soft, idempotente y observable: procesará en lotes con una
limitación explícita para Open Library, reutilizará la caché TTL de una hora y
emitirá un resumen de actualizadas, conservadas y errores. No se modifica el
esquema, el contrato HTTP ni ningún contenedor o configuración de imágenes del
frontend.

## Implementación

1. Actualizar los mapeadores de `apps/api/app/services/isbn_lookup.py`: elegir
   `cover.large`, después `cover.medium` y por último `cover.small` en `/api/books`;
   construir las portadas de `search.json` con sufijo `-L.jpg`; y normalizar las
   URLs de Google Books sustituyendo `http` por `https` y `zoom=1` por `zoom=3`
   (preservando cualquier otro parámetro). Aplicar los mismos helpers a lookup
   por ISBN y búsqueda textual, manteniendo los modelos y sus respuestas.
2. Añadir en `apps/api/scripts/backfill_cover_urls.py` un comando asíncrono de una
   sola ejecución que inicialice el cliente Supabase `service_role`, recupere
   `id`, `isbn13` y `cover_url` de `books`, agrupe ISBN13 repetidos y ejecute el
   `ISBNLookupService` compartido. Para cada fila, hacer únicamente
   `UPDATE books SET cover_url = ... WHERE id = ...` cuando el re-lookup devuelve
   una portada; conservar intacta la fila ante error, ausencia de portada o
   resultado no utilizable.
3. Implementar en el backfill un limitador de Open Library que cuente cada
   intento HTTP, respete como máximo 100 solicitudes por ventana de 60 segundos
   (incluidos reintentos y el fallback `search.json`) y mantenga la caché TTL de
   una hora del servicio para ISBN repetidos. Procesar lotes documentados de
   hasta 50 ISBN únicos, esperar la siguiente ventana antes de continuar y
   registrar por libro/ISBN el resultado; al finalizar imprimir un resumen con
   total procesado, actualizadas, conservadas por fallo/sin portada y errores.
4. Documentar el comando y su evidencia de ejecución en el propio script y en
   `spec/features/032-book-cover-quality/tasks.md` cuando se descomponga el plan;
   no exponer el backfill como endpoint público ni ejecutarlo durante el arranque
   de FastAPI. Validar que requiere `SUPABASE_URL` y
   `SUPABASE_SERVICE_ROLE_KEY` sin registrar secretos.
5. Actualizar los tests backend junto a la implementación:
   `apps/api/app/services/test_isbn_lookup.py` cubrirá las tres prioridades de
   `/api/books`, `-L.jpg`, normalización Google y sus variantes; los tests de
   `apps/api/app/api/v1/test_lookup.py`, `apps/api/app/api/v1/test_suggestions.py`
   y `apps/api/tests/test_books.py` verificarán que lookup, sugerencias y POST
   conservan el contrato y persisten la URL normalizada. Añadir tests unitarios
   del backfill para éxito, error/timeout, ausencia de portada, no modificación
   de otros campos, deduplicación y resumen.
6. Actualizar los fixtures y expectativas de portadas en la suite web, en
   particular los fixtures `-M.jpg` existentes (y cualquier expectativa Google)
   bajo `apps/web/src/**`, sin editar `BookCard`, `BookHeader`,
   `BookMetadataPreview`, sus contenedores, `sizes`/`width` ni
   `apps/web/next.config.mjs`. Confirmar que el cambio se consume como datos y no
   como cambio de layout.
7. Ejecutar la validación completa exigida por la spec: `cd apps/api && pytest -v`
   y `ruff check . && black --check .`; `cd apps/web && npm run test`,
   `npm run lint` y `npm run build`. Ejecutar el backfill solo contra el entorno
   autorizado y conservar la salida del comando como evidencia de cantidades
   actualizadas/conservadas; no tocar `supabase/migrations/`.

## Decisiones

- **Mayor resolución en origen** — Se centraliza la prioridad `large → medium →
  small` y la transformación de URLs en `ISBNLookupService`, porque lookup,
  alta y sugerencias ya comparten este servicio. Se descarta cambiar el layout,
  `next/image` o guardar binarios/proxies, que están fuera de alcance.
- **Normalización determinista de Google Books** — Se usa una función sin
  dependencias que fuerza `https` y establece `zoom=3`, conservando el resto de
  la URL. Se descarta confiar en que Google entregue siempre HTTPS o añadir otro
  proveedor de imágenes.
- **Backfill como comando administrativo** — Se elige un script manual,
  idempotente y con `service_role`, con filtro por `id` y update exclusivo de
  `cover_url`; no se crea endpoint ni tarea automática porque la misión no
  contempla procesos autónomos y el riesgo de mutar datos debe ser explícito.
- **Rate limit conservador y caché existente** — El limitador cuenta todos los
  intentos Open Library y pausa por ventanas de 60 segundos, mientras el
  servicio conserva el TTL de 1 hora. Se descartan Redis, una migración y
  `supabase db reset`: no aportan nada a un backfill único y contradicen los
  límites de dependencias/esquema.
- **Fail-soft por fila** — Un fallo de red, rate limit, 404, timeout o respuesta
  sin portada incrementa el contador de conservadas y no escribe la fila; nunca
  se usa `upsert`, `UPDATE` global ni se reemplazan otros metadatos.

## Riesgos

- **Open Library rate-limits o cambia el esquema** — El limitador cuenta también
  reintentos, limita a 100 por minuto, conserva la caché TTL y el servicio
  continúa con Google Books; tests fijan las formas de respuesta esperadas.
- **El backfill degrada o borra portadas existentes** — Solo se actualiza cuando
  la respuesta contiene una URL no vacía y se filtra por el `id` original; los
  tests verifican errores, ausencia de portada y que los demás campos no cambian.
- **Una ejecución larga se interrumpe o se repite** — El comando es idempotente,
  procesa por lotes y registra cada resultado; una nueva ejecución puede
  continuar sin migración ni duplicar libros.
- **Duplicados de ISBN hacen demasiadas llamadas** — Se deduplican ISBN13 en
  memoria, se reutiliza la caché TTL y se actualizan después todas las filas que
  correspondan al resultado válido.
- **Secretos o acceso cruzado por RLS** — El script solo lee/escribe desde
  backend con `service_role`, valida variables de entorno y nunca imprime claves;
  no se añade ningún uso de esa clave al frontend.
- **Regresiones de contrato o UI** — Los mapeadores devuelven los mismos modelos,
  los tests de endpoints/sugerencias y frontend fijan el esquema, y la
  validación final incluye la suite, lint y build sin tocar layouts ni
  `next.config.mjs`.
