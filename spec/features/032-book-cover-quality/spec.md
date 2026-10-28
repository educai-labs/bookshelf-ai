# 032 · Book Cover Quality

**Estado:** propuesta

## Qué hace

Las portadas de los libros se ven nítidas (no pixeladas) en toda la app: grid del
dashboard, ficha del libro, preview del alta por ISBN y sugerencias de búsqueda.
El backend deja de construir/guardar URLs de portada en resolución miniatura y
elige siempre la mayor resolución disponible de la fuente:

- Open Library `/api/books`: prioridad `cover.large` → `medium` → `small`
  (hoy prioriza `small`).
- Open Library `search.json` (lookup ISBN y sugerencias): sufijo `-L.jpg` al
  construir la URL desde `cover_i` (hoy `-M.jpg`).
- Google Books (fallback de lookup y sugerencias): la URL del `thumbnail`
  (`zoom=1`, ~128px, frecuentemente `http://`) se transforma a `zoom=3` + `https`
  antes de devolverla o guardarla.

Además, un backfill re-hace lookup por ISBN13 de los libros ya guardados y
actualiza su `cover_url` en BD solo cuando el re-lookup devuelve una portada;
si falla o no hay portada, el libro conserva su portada actual (nunca degrada,
nunca borra, nunca toca otros campos).

## Por qué

Las portadas en la app se ven muy pixeladas aunque la fuente sí dispone de
resoluciones correctas. Causa verificada en `apps/api/app/services/isbn_lookup.py`:
el camino primario prioriza `cover.small` (L416), los fallbacks de Open Library
construyen `-M.jpg` (~180px; L221-222 y L452-453) y el fallback de Google Books
guarda el `thumbnail` zoom=1 de ~128px, a menudo con scheme `http://` que el
optimizador https-only de `next/image` rechaza (dispara el placeholder). El
frontend ya está bien configurado (`next/image` con `fill` + `sizes` responsive
en BookCard/BookHeader, `width=300` en BookMetadataPreview): pide ~300-450px
pero el origen no los tiene, y el optimizador no puede inventar píxeles. La URL
degradada se persiste en `books.cover_url`, así que los libros ya guardados
quedaron con miniaturas. Corregir el origen + refrescar los existentes arregla
el síntoma en todas las vistas de una vez sin tocar layout ni contrato de API.

## Criterios de aceptación

- [ ] Con Open Library `/api/books?jscmd=data` devolviendo
      `cover: {small, medium, large}`, `GET /api/v1/books/lookup?isbn=…`
      devuelve exactamente la URL de `large`; y ante `{medium, small}` devuelve
      `medium` (prioridad large → medium → small, nunca `small` si hay mayor).
- [ ] Los fallbacks de `search.json` (lookup por ISBN y sugerencias de texto)
      construyen `https://covers.openlibrary.org/b/id/<cover_i>-L.jpg`
      (sufijo `-L`, nunca `-M` ni `-S`) cuando `cover_i` existe; `None` si no.
- [ ] El fallback de Google Books (lookup y sugerencias) devuelve la URL del
      `thumbnail` transformada: `zoom=3` (nunca `zoom=1`) y scheme `https`
      (nunca `http`), en la respuesta del endpoint y en lo que se persiste.
- [ ] `POST /api/v1/books` persiste en `books.cover_url` la URL de alta
      resolución sin degradarla (para las tres fuentes anteriores).
- [ ] Tras ejecutar el backfill, ningún libro de la biblioteca con portada
      disponible mantiene una `cover_url` con sufijo `-S.jpg`/`-M.jpg` de Open
      Library ni un `zoom=1` de Google Books (inspección de BD o de
      `GET /api/v1/books`).
- [ ] El backfill es fail-soft por libro: si el re-lookup falla (red, 404,
      timeout, rate limit) o no devuelve portada, el libro conserva su
      `cover_url` anterior intacta; nunca borra portadas ni modifica ningún
      otro campo (`title`, `authors`, etc.).
- [ ] El backfill respeta el rate limit de Open Library (100 req/min:
      reutiliza la caché TTL 1h y procesa con throttling/lotes documentados
      en plan.md) y es ejecutable una sola vez con evidencia del resultado
      (cuántas portadas actualizadas/conservadas).
- [ ] Sin cambios de contrato ni de layout: los endpoints (`lookup`,
      `POST /books`, sugerencias) mantienen su esquema de respuesta; BookCard,
      BookHeader y BookMetadataPreview no cambian contenedores ni
      `sizes`/`width` actuales; `next.config.mjs` intacto.
- [ ] Tests actualizados a la nueva expectativa (service + endpoints +
      sugerencias + fixture `-M.jpg` del frontend) y suite completa verde:
      `cd apps/api && pytest -v` 100%, `ruff check . && black --check .` exit 0;
      `cd apps/web && npm run test`, `npm run lint`, `npm run build` OK.

## Fuera de alcance

- Servir, cachear o hacer proxy de binarios de portada desde el backend: se
  sigue referenciando la URL de la fuente + optimizador `next/image`.
- Cambiar `next.config.mjs` (remotePatterns ya correctos) o los `sizes`/
  `width` de los componentes: el frontend ya pide el tamaño correcto; el
  problema era el origen.
- Editar `cover_url` manualmente por el usuario o portadas personalizadas
  (subir imagen propia): posible feature futura.
- Migración de esquema: `books.cover_url` ya es `text`; el backfill solo hace
  UPDATE de filas existentes (`supabase/migrations/` intacto, append-only).
- Garantizar anchos nativos retina 2x/3x (≥600px) cuando la fuente no los
  ofrece: se usa la mayor resolución disponible de la fuente (`-L` ~500px).
- Re-añadir libros ni recompletar metadatos faltantes en el backfill (solo
  `cover_url`).
