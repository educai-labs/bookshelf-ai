# 028 · Navigation & Layout Robustness

**Estado:** propuesta

## Qué hace

Endurece la navegación, el layout y el manejo de errores globales del frontend (hallazgos Z5-01…Z5-09, Z1-03 y Z1-04 de la auditoría):

1. **Navegación sin 404s propios:** el item "Libros" del Sidebar apunta a `/books`, una ruta inexistente (Z5-01); la marca "Bookshelf" del DashboardHeader es un div no clicable (Z5-06).
2. **Páginas de error de Next:** no existen `error.tsx`, `not-found.tsx` ni `global-error.tsx`; un throw de un Server Component cae en la pantalla por defecto de Next (Z5-02).
3. **Sidebar usable en móvil:** fijo a `w-56` sin colapso/drawer, ocupa ~40% del ancho en móvil (Z5-03), y el link activo no expone `aria-current="page"` (Z5-04).
4. **`redirectTo` respetado:** el middleware guarda `?redirectTo=<ruta>` al expulsar a login, pero login/register siempre hacen `router.push("/dashboard")` (Z5-05).
5. **Errores con contexto:** `useBooks` pierde status/code al lanzar Error y un 401 no redirige a login (Z1-03); el seed SSR del dashboard filtra solo por título (`ilike(title)`) mientras el API busca título+autor (Z1-04).
6. **Estructura:** `<html lang="es">` hardcodeado (Z5-07), ConfirmDialog importado por book-detail desde components/settings, acoplando módulos (Z5-08), y decisión documentada sobre header/sidebar/provider como client components que envuelven el árbol (Z5-09, informativo).

## Por qué

La navegación es el esqueleto de la app y hoy tiene un enlace muerto hacia la vista principal (Z5-01, ALTA: pulsar "Libros" da 404), no existe ninguna UI de error global (Z5-02) y en móvil el layout es inservible con el sidebar comiendo ~40% de la pantalla (Z5-03). El flujo post-login rompe la promesa del middleware: te expulsa a login protegiendo una ruta y luego te manda siempre al dashboard en vez de devolverte a donde ibas (Z5-05). La pérdida de status en los errores (Z1-03) impide el manejo básico de sesión caducada (401→login), y mover ConfirmDialog a un módulo común (Z5-08) es deuda estructural barata de pagar ahora. Esta feature convierte el shell de la app en robusto antes de pulir detalles visuales (030).

## Criterios de aceptación

**Navegación (Z5-01, Z5-06):**

- [ ] El item "Libros" del Sidebar navega a una ruta existente (`/dashboard`): ningún enlace del Sidebar apunta a una ruta no definida en el App Router (test de render con mapa de rutas).
- [ ] La marca "Bookshelf" del DashboardHeader es un enlace a `/dashboard` (test: renderiza un anchor con `href="/dashboard"`).

**Páginas de error de Next (Z5-02):**

- [ ] Existen `not-found.tsx` y `error.tsx` en `apps/web` (raíz o route group `(dashboard)`) y `global-error.tsx` en la raíz, con UI consistente con shadcn y textos i18n es/en.
- [ ] Una ruta inexistente muestra `not-found.tsx` con acción de volver al dashboard; un throw de un Server Component muestra `error.tsx` con botón de **reintento** (retry), no la pantalla por defecto de Next.
- [ ] `global-error.tsx` incluye su propio `<html>`/`<body>` válidos y un botón de recarga.

**Sidebar responsive y accesible (Z5-03, Z5-04):**

- [ ] En viewport <640px el sidebar está colapsado por defecto y se abre como drawer con overlay: botón de menú accesible (aria-label i18n), cierre con Escape y con click en el overlay.
- [ ] En ≥640px se mantiene el comportamiento actual (sidebar fijo) sin regresión visual.
- [ ] El enlace activo del Sidebar expone `aria-current="page"` (test con pathname mockeado).

**redirectTo tras login (Z5-05):**

- [ ] Si el middleware redirigió a login guardando `?redirectTo=<ruta>`, tras login exitoso (OAuth o email) el usuario vuelve a esa ruta, no siempre a `/dashboard`.
- [ ] El `redirectTo` se valida como ruta interna relativa (empieza por `/`, no por `//`, sin esquema ni hostname) antes de navegar: un valor externo o malformado cae a `/dashboard` (sin open redirect; test con casos maliciosos).

**Errores con contexto (Z1-03, Z1-04):**

- [ ] `useBooks` propaga errores con status HTTP (p. ej. Error con `status`/`code`): un 401 en las llamadas de biblioteca redirige a login (con redirectTo de vuelta) y un 5xx muestra ErrorState; tests mockeando 401 y 500.
- [ ] El seed SSR del dashboard filtra por título **y autor** (mismo criterio que el API de 009): SSR y cliente devuelven el mismo resultado para la misma búsqueda (test de paridad de criterio).

**Estructura (Z5-07, Z5-08, Z5-09):**

- [ ] `<html lang>` refleja el idioma preferido del usuario: tras cargar la app con preferencia `en`, `document.documentElement.lang === "en"` (y `es` en español); el SSR lo computa desde la fuente disponible en servidor (p. ej. cookie de preferencia) cuando existe. El mecanismo elegido queda documentado en `plan.md`.
- [ ] ConfirmDialog vive en un módulo común (`components/ui`) y book-detail lo importa desde ahí; sin imports de book-detail → components/settings (grep lo verifica).
- [ ] La decisión sobre Z5-09 (header/sidebar/provider como client components envolviendo el árbol) queda documentada en `plan.md` (mantener o extraer, con justificación); informativo, sin refactor obligatorio.

**i18n y validación:**

- [ ] Todos los textos nuevos (error/not-found/drawer/menú) existen en es y en; sin claves huérfanas.
- [ ] `cd apps/web && npm run test`, `npm run lint` y `npm run build` en verde tras la feature.

## Fuera de alcance

- **No se modifican las features en "Hecho ✅"** (011/013/014/015) más allá de los fixes citados: el Sidebar/DashboardHeader se corrigen, no se rediseñan (sin nuevo sistema de navegación, breadcrumbs ni menús multi-nivel).
- **No se añaden dependencias**: el drawer/collapse se implementa con lo ya disponible (Radix/shadcn existente); `package.json` sin cambios (límite duro de `tech-stack.md`: ninguna dependencia nueva sin justificación).
- Refactor completo a Server Components del layout (Z5-09): aquí solo se **documenta** la decisión; si se aprueba extraer, será feature nueva.
- Sincronización de filtros del dashboard con la URL (Z1-06) → feature **030**; aquí solo el `redirectTo` de login/middleware.
- Rediseño responsivo completo del dashboard (grid/cards): fuera; solo el shell de navegación.
- No se toca el backend ni `supabase/migrations/`.
