# 014 · Add Book Modal + ISBN

**Estado:** propuesta

## Qué hace

Implementa el flujo "Añadir libro" desde el dashboard:
1. Botón "Añadir libro" (header dashboard + empty state) → abre `Dialog` (shadcn).
2. Modal: input ISBN-13 (con máscara/formato auto: `978-0-000-00000-0` → normaliza a 13 dígitos), botón "Buscar".
3. Al buscar: `GET /api/v1/books/lookup?isbn=...` → muestra preview: portada grande, título, autor(es), páginas, editorial, fecha, descripción. Estado loading en botón.
4. Si lookup OK: botón "Guardar libro" habilitado → `POST /api/v1/books` con `BookCreate` (isbn13 + status default `want_to_read`).
5. Éxito: cierra modal, toast "Libro añadido", refresca grid (invalidación query / re-fetch).
6. Errores: ISBN inválido (formato), no encontrado (404), duplicado (409), red (toast específico).

## Por qué

ISBN como llave maestra (decisión confirmada) elimina entrada manual propensa a errores. Preview antes de guardar da confianza. Modal mantiene contexto (no navegas fuera del dashboard). Flow completo en < 30s típico.

## Criterios de aceptación

- [ ] `AddBookModal` component: `Dialog` con `DialogTrigger` (botón header), `DialogContent` centrado, max-w-md.
- [ ] Input ISBN: `Input` con `onChange` normaliza (quita no-dígitos), valida longitud 13, muestra helper "Formato: 978XXXXXXXXXX".
- [ ] Botón "Buscar": `disabled` si ISBN inválido; loading state durante fetch.
- [ ] Preview area: condicional (solo tras lookup exitoso). Muestra `BookMetadata` fields: `Image` portada, `title`, `authors` join ", ", `page_count`, `publisher`, `published_date`, `description` (truncado, "Ver más").
- [ ] Botón "Guardar": `POST /api/v1/books` con `{ isbn13, status: "want_to_read" }`; success → `onSuccess` callback (cierra modal, `queryClient.invalidateQueries({ queryKey: ['books'] })`).
- [ ] Manejo errores: 400 (ISBN inválido), 404 (no encontrado en OL/GB), 409 (ya en tu biblioteca), 500 (server) → toasts descriptivos.
- [ ] Accesibilidad: `Dialog` trap focus, `Esc` cierra, labels en inputs, `aria-live` para toasts.
- [ ] Tests: RTL — flujo completo happy path (mock API), validación ISBN, errores 404/409, cerrar modal sin guardar.
- [ ] Integración: botón "Añadir libro" en `DashboardHeader` y `EmptyState` abre mismo modal (compartido).

## Fuera de alcance

- Edición de metadatos en preview (título, autores) — se guardan tal cual vienen de API.
- Selección de status/rating en modal — default `want_to_read`, sin rating; se editan en ficha (feature 015).
- Búsqueda por título/autor sin ISBN — feature futura.
- Escaneo código de barras (cámara) — feature móvil futura.