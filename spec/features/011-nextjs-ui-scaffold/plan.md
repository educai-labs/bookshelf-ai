# 011 · Next.js UI Scaffold — Plan

**Estado:** borrador

## Enfoque

Se construirá el scaffold completo de la aplicación Next.js 14+ (App Router) en `apps/web/` siguiendo una estrategia **modular por capas** que respete estrictamente la arquitectura definida en `tech-stack.md` (líneas 8-9, 26-31) y los principios de la constitución:

1. **Estructura de carpetas** replicando exactamente `src/{app,components,lib,hooks,types}` para aislar responsabilidades: App Router pages (route groups `(auth)` y `(dashboard)`), componentes (shadcn/ui base + layout + providers), librería (Supabase clients browser/server + utils + validaciones), hooks de auth, y tipos compartidos espejo de Pydantic models.
2. **Supabase clients diferenciados** (browser vs server) siguiendo mejores prácticas Next.js 14: `createBrowserClient` singleton memoizado en `lib/supabase/client.ts` para Client Components; `createServerClient` con `cookies()` de `next/headers` en `lib/supabase/server.ts` para Server Components/Route Handlers; `updateSession` en `lib/supabase/middleware.ts` para refrescar cookies de auth en cada request vía `middleware.ts` en raíz.
3. **Providers centralizados** en `app/providers.tsx` (Client Component): `SessionProvider` (`@supabase/auth-helpers-nextjs` o `@supabase/ssr`), `Toaster` (sonner), `ThemeProvider` (next-themes) — evita prop-drilling y garantiza contexto de sesión/tema/toasts en todo el árbol.
4. **Configuración shadcn/ui** vía `components.json`: style "new-york", RSC=true, TSX=true, Tailwind CSS variables, alias `@/components/ui` — base para componentes UI consistentes y dark mode via `class` strategy.
5. **Tailwind + CSS variables** en `globals.css`: directivas `@tailwind base/components/utilities` + shadcn CSS variables (light/dark) — sistema de color primary blue-600, accent amber-500 (rating stars), tipografías Inter / JetBrains Mono (tech-stack líneas 131-135).
6. **Tipos TypeScript compartidos** en `src/types/index.ts`: `Book`, `Note`, `BookMetadata`, `ChatRequest`, `ChatResponseChunk` espejo de Pydantic models (feature 007) — single source of truth frontend/backend.
7. **Validación completa** local: `npm run dev` (puerto 3000 sin errores TS/ESLint), `npm run build` (standalone output para Docker), `npm run lint` (ESLint + Prettier) — todos pasan antes de considerar la feature completa.
8. **Dockerfile opcional** multi-stage (builder → runtime `node:20-alpine`) con output standalone para deploy en Render/Vercel — consistente con backend.

Este enfoque evita decisiones que contradigan `tech-stack.md`: Supabase browser/server clients separados (no `service_role` en frontend), no hardcodeo de URLs (`NEXT_PUBLIC_SUPABASE_URL`), route groups para layouts público/protegido, y dependencias justificadas (shadcn/ui, sonner, next-themes, @supabase/ssr, zod, lucide-react).

## Implementación

| Paso | Acción | Archivos / Módulos afectados |
|------|--------|------------------------------|
| 1 | Crear estructura de directorios `apps/web/src/{app/(auth),app/(dashboard),app/providers,components/{ui,layout,providers},lib/{supabase,utils,validations},hooks,types}` + archivos `__init__` vacíos donde aplique | `apps/web/src/` (árbol completo) |
| 2 | Inicializar `package.json` con dependencias: `next@14`, `react@18`, `react-dom@18`, `typescript`, `@types/react`, `@types/node`, `tailwindcss`, `postcss`, `autoprefixer`, `@supabase/ssr`, `@supabase/supabase-js`, `sonner`, `next-themes`, `zod`, `lucide-react`, `clsx`, `tailwind-merge`, `eslint`, `prettier`, `eslint-config-next`, `eslint-plugin-tailwindcss`, `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`, `vitest`, `@testing-library/react`, `jsdom`, `@types/jsdom` | `apps/web/package.json` |
| 3 | Crear `tsconfig.json` estricto: `target: "ES2017"`, `lib: ["dom", "dom.iterable", "esnext"]`, `allowJs: true`, `skipLibCheck: true`, `strict: true`, `noEmit: true`, `esModuleInterop: true`, `module: "esnext"`, `moduleResolution: "bundler"`, `resolveJsonModule: true`, `isolatedModules: true`, `jsx: "preserve"`, `incremental: true`, `plugins: [{name: "next"}]`, `paths: {"@/*": ["./src/*"]}` | `apps/web/tsconfig.json` |
| 4 | Crear `next.config.mjs`: `output: "standalone"`, `experimental: {serverActions: {bodySizeLimit: "2mb"}}`, `images: {remotePatterns: [{protocol: "https", hostname: "*.supabase.co"}]}` | `apps/web/next.config.mjs` |
| 5 | Crear `tailwind.config.ts`: `content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"]`, `theme: {extend: {colors: {primary: {...}, accent: {...}}, fontFamily: {sans: ["Inter", "system-ui"], mono: ["JetBrains Mono", "monospace"]}}}`, `plugins: []`, `darkMode: "class"` | `apps/web/tailwind.config.ts` |
| 6 | Crear `postcss.config.mjs`: `plugins: {tailwindcss: {}, autoprefixer: {}}` | `apps/web/postcss.config.mjs` |
| 7 | Crear `.env.example`: `NEXT_PUBLIC_SUPABASE_URL=`, `NEXT_PUBLIC_SUPABASE_ANON_KEY=` | `apps/web/.env.example` |
| 8 | Crear `components.json` (shadcn/ui config): `{"$schema": "https://ui.shadcn.com/schema.json", "style": "new-york", "rsc": true, "tsx": true, "tailwind": {"config": "tailwind.config.ts", "css": "src/app/globals.css", "baseColor": "slate", "cssVariables": true}, "aliases": {"components": "@/components", "utils": "@/lib/utils", "ui": "@/components/ui", "lib": "@/lib", "hooks": "@/hooks"}}` | `apps/web/components.json` |
| 9 | Crear `src/lib/utils.ts`: `cn(...inputs)` usando `clsx` + `tailwind-merge`; `formatDate(date: string | Date, options?: Intl.DateTimeFormatOptions)` | `apps/web/src/lib/utils.ts` |
| 10 | Crear `src/lib/supabase/client.ts`: `createBrowserClient` memoizado con `createBrowserClient` de `@supabase/ssr` — singleton exportado `supabase` | `apps/web/src/lib/supabase/client.ts` |
| 11 | Crear `src/lib/supabase/server.ts`: `createServerClient` usando `createServerClient` de `@supabase/ssr` + `cookies()` de `next/headers` — exporta `createServerClient` function | `apps/web/src/lib/supabase/server.ts` |
| 12 | Crear `src/lib/supabase/middleware.ts`: `updateSession` exportado — usa `createServerClient` + `cookies()` para refrescar sesión en middleware | `apps/web/src/lib/supabase/middleware.ts` |
| 13 | Crear `middleware.ts` en raíz: `export { updateSession as middleware } from "./src/lib/supabase/middleware"`; `export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)"] }` | `apps/web/middleware.ts` |
| 14 | Crear `src/app/globals.css`: `@tailwind base; @tailwind components; @tailwind utilities;` + shadcn CSS variables (`:root` y `.dark` con `--background`, `--foreground`, `--primary`, `--secondary`, `--accent`, `--muted`, `--border`, `--ring`, `--radius`) | `apps/web/src/app/globals.css` |
| 15 | Crear `src/app/providers.tsx` (Client Component): `SessionProvider` (`@supabase/ssr` o `@supabase/auth-helpers-nextjs`), `Toaster` (sonner), `ThemeProvider` (next-themes, `attribute="class"`, `defaultTheme="system"`, `enableSystem`); exporta `Providers` wrapper | `apps/web/src/app/providers.tsx` |
| 16 | Crear `src/app/layout.tsx`: importa `globals.css`, fuentes `Inter` + `JetBrains_Mono` de `next/font/google` (`variable: "--font-sans"`, `variable: "--font-mono"`), envuelve children en `<Providers>`; metadata básica (title, description) | `apps/web/src/app/layout.tsx` |
| 17 | Crear `src/app/page.tsx`: Server Component que usa `createServerClient` → `supabase.auth.getUser()` → redirect a `/dashboard` si authed, else `/login` | `apps/web/src/app/page.tsx` |
| 18 | Crear route group `(auth)`: `src/app/(auth)/layout.tsx` (layout público sin sidebar/header), `src/app/(auth)/login/page.tsx` (placeholder "Login - Feature 012"), `src/app/(auth)/register/page.tsx` (placeholder "Register - Feature 012") | `apps/web/src/app/(auth)/` |
| 19 | Crear route group `(dashboard)`: `src/app/(dashboard)/layout.tsx` (layout protegido con Header + Sidebar), `src/app/(dashboard)/page.tsx` (placeholder "Dashboard - Feature 013"), `src/app/(dashboard)/book/[id]/page.tsx` (placeholder "Book Detail - Feature 015") | `apps/web/src/app/(dashboard)/` |
| 20 | Crear componentes layout base: `src/components/layout/Header.tsx` (Avatar + user menu placeholder), `src/components/layout/Sidebar.tsx` (navegación: Dashboard, Books, Settings), `src/components/layout/Footer.tsx` (copyright) | `apps/web/src/components/layout/` |
| 21 | Crear `src/components/providers/SessionProvider.tsx`: wrapper fino sobre `createContext` + `useContext` para sesión de usuario (acceso a `user` en Client Components sin prop-drilling) | `apps/web/src/components/providers/SessionProvider.tsx` |
| 22 | Inicializar shadcn/ui base components: ejecutar `npx shadcn-ui@latest add button card dialog input label textarea select tabs avatar badge skeleton tooltip --yes` (o crear manualmente los archivos base) → genera `src/components/ui/{button,card,dialog,input,label,textarea,select,tabs,avatar,badge,skeleton,tooltip}.tsx` | `apps/web/src/components/ui/` |
| 23 | Crear `src/hooks/useAuth.ts`: `useUser()` → usa `SessionProvider` context; `useSession()` → wrapper sobre `supabase.auth.getSession()` + listener `onAuthStateChange` | `apps/web/src/hooks/useAuth.ts` |
| 24 | Crear `src/types/index.ts`: interfaces `Book` (id, user_id, isbn13, title, authors, cover_url, page_count, publisher, published_date, description, status, rating, started_at, finished_at, created_at, updated_at), `Note` (id, user_id, book_id, content, content_html, chunk_index, embedding, created_at), `BookMetadata` (title, authors[], cover_url, page_count, publisher, published_date, description), `ChatRequest` (message, book_ids?, top_k?), `ChatResponseChunk` (chunk, done, book_references?) | `apps/web/src/types/index.ts` |
| 25 | Crear `src/lib/validations/index.ts`: exporta esquemas Zod vacíos placeholder (`bookSchema`, `noteSchema`, `chatSchema`) — se poblarán en features 012-015 | `apps/web/src/lib/validations/index.ts` |
| 26 | Crear `Dockerfile` multi-stage: **builder** (`node:20-alpine`, `npm ci`, `npm run build`), **runtime** (`node:20-alpine`, `COPY --from=builder /app/public ./public`, `COPY --from=builder /app/.next/standalone ./`, `COPY --from=builder /app/.next/static ./.next/static`, `USER nextjs`, `EXPOSE 3000`, `CMD ["node", "server.js"]`) | `apps/web/Dockerfile` |
| 27 | Crear `.dockerignore`: `node_modules`, `.next`, `.git`, `*.log`, `.env*`, `Dockerfile`, `.dockerignore`, `README.md` | `apps/web/.dockerignore` |
| 28 | Crear `vitest.config.ts`: `import { defineConfig } from "vitest/config"; import react from "@vitejs/plugin-react"; export default defineConfig({ plugins: [react()], test: { environment: "jsdom", setupFiles: ["./vitest.setup.ts"], include: ["src/**/*.test.{ts,tsx}"] } })` | `apps/web/vitest.config.ts` |
| 29 | Crear `vitest.setup.ts`: `import "@testing-library/jest-dom"; import { vi } from "vitest"; vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/", useSearchParams: () => new URLSearchParams() })); vi.mock("next/headers", () => ({ cookies: () => ({ get: () => undefined, set: vi.fn(), delete: vi.fn() }) }))` | `apps/web/vitest.setup.ts` |
| 30 | Crear test smoke: `src/app/page.test.tsx` — render `<Page />` con mock de `createServerClient` → verifica redirect logic | `apps/web/src/app/page.test.tsx` |
| 31 | Crear test smoke: `src/lib/supabase/client.test.ts` — verifica singleton `supabase` exportado y memoizado | `apps/web/src/lib/supabase/client.test.ts` |
| 32 | Crear test smoke: `src/components/providers/SessionProvider.test.tsx` — verifica context provider/consumer | `apps/web/src/components/providers/SessionProvider.test.tsx` |
| 33 | Instalar dependencias: `cd apps/web && npm install` | Terminal |
| 34 | Verificar `npm run dev` arranca en puerto 3000 sin errores TypeScript/ESLint; accesible en `http://localhost:3000`; redirige a `/login` (no authed) | Terminal |
| 35 | Ejecutar `npm run build` → compila exitosamente, genera output `standalone` en `.next/standalone` | Terminal |
| 36 | Ejecutar `npm run lint` → pasa (ESLint + Prettier sin warnings) | Terminal |
| 37 | Ejecutar `npm run test` → tests smoke pasan (Vitest + React Testing Library) | Terminal |
| 38 | Build Docker: `cd apps/web && docker build -t bookshelf-web . && docker run --rm -d -p 3000:3000 --name web-test bookshelf-web` → healthcheck manual en `http://localhost:3000` | Terminal |

> **Nota**: Los placeholders en `(auth)/login`, `(auth)/register`, `(dashboard)/page`, `(dashboard)/book/[id]` son intencionales — features 012, 013, 015 implementarán la UI real. `src/lib/validations/` se poblará en features 012+.

## Decisiones

| Decisión | Justificación | Alternativa descartada |
|----------|---------------|------------------------|
| **Route groups `(auth)` y `(dashboard)`** | Separación nativa de layouts público/protegido en App Router sin afectar URLs; `(dashboard)` layout incluye Header/Sidebar, `(auth)` layout limpio. | Layout único con condicionales `if (session)` — acopla lógica de auth a layout raíz, menos limpio. |
| **`@supabase/ssr` para browser + server clients** | Paquete oficial unificado para Next.js App Router; maneja cookies automáticamente en Server Components (via `next/headers`) y Client Components (via `document.cookie`). Soporta middleware `updateSession`. | `@supabase/auth-helpers-nextjs` — legacy, deprecado en favor de `@supabase/ssr`; `supabase-js` directo — no maneja cookies Next.js 14 correctamente. |
| **`createBrowserClient` memoizado (singleton)** | Evita múltiples instancias en Client Components (re-renders crean clientes nuevos); `useMemo` o module-level singleton. | Crear cliente por componente — memory leaks, múltiples suscripciones auth, cookies inconsistentes. |
| **`createServerClient` con `cookies()` de `next/headers`** | Server Components/Route Handlers acceden a cookies de request nativamente; `createServerClient` las lee/escribe automáticamente. | Pasar cookies manualmente — propenso a errores, no funciona en Server Components puros. |
| **`middleware.ts` en raíz con `updateSession`** | Refresca sesión en cada request (Server Components leen cookies frescas); matcher excluye assets estáticos. | Sin middleware — sesión expira, Server Components ven usuario deslogueado aunque browser tenga sesión válida. |
| **`providers.tsx` centralizado** | Un solo Client Component en layout raíz provee Session + Theme + Toasts a todo el árbol; evita imports repetidos. | Providers por página — duplicación, inconsistencia (tema/toasts rotos en navegación). |
| **shadcn/ui "new-york" style + CSS variables** | Coincide con `tech-stack.md` líneas 131-135: primary blue-600, accent amber-500, dark mode via `class`, CSS variables para theming dinámico. | "default" style — menos flexible para theming; Tailwind config-only sin CSS variables — dark mode limitado. |
| **Tipos en `src/types/index.ts` espejo de Pydantic** | Single source of truth compartido frontend/backend; evita drift de tipos; feature 007 define modelos Python, este plan los replica en TS. | Tipos inline en cada componente — duplicación, inconsistencias, refactor doloroso. |
| **Zod para validaciones frontend** | Alineado con `tech-stack.md` línea 121: "Zod en frontend (forms, API responses)"; integra con React Hook Forms (futuro) y valida responses API. | Yup / Joi — Zod es estándar en ecosistema TypeScript/Next.js, mejor DX, tree-shaking. |
| **Output `standalone` en `next.config.mjs`** | Requerido para Docker multi-stage (copia solo archivos necesarios); `tech-stack.md` línea 18 menciona deploy Docker en Render. | Output default — imagen Docker > 1GB, incluye `node_modules` completo, build lento. |
| **Dockerfile multi-stage `node:20-alpine`** | Imagen final mínima (~100 MB), solo runtime + standalone output; consistente con backend Dockerfile. | `node:20-slim` — mayor tamaño, build tools innecesarios en runtime. |
| **Vitest + React Testing Library + jsdom** | Alineado con `tech-stack.md` línea 16: "Vitest + React Testing Library (frontend)"; rápido, compatible con Vite/Next.js, buena DX. | Jest — configuración más compleja en Next.js 14, más lento; Playwright/Cypress — E2E, no unit/integration (feature futura). |
| **`clsx` + `tailwind-merge` en `cn()`** | Utilidad estándar shadcn/ui para combinar clases condicionales + merge de conflictos Tailwind; usado en todos los componentes ui. | `classnames` solo — no maneja conflictos Tailwind (ej. `p-2 p-4` → `p-4`); template literals — verboso, sin merge. |

## Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| **Versiones de dependencias incompatibles (Next.js 14 vs React 18 vs shadcn/ui vs @supabase/ssr)** | Media | Alto (build/test fallan, hydration errors) | Fijar versiones compatibles en `package.json` (ej. `next@14.2.x`, `react@18.3.x`, `@supabase/ssr@0.5.x`, `shadcn-ui` components generados con CLI compatible). Probar `npm install` limpio en Docker builder. |
| **`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` no configuradas en `.env.local`** | Alta (config manual) | Crítico (Supabase clients fallan, auth rota) | Documentar en `.env.example` y README; validar en `client.ts`/`server.ts` con `if (!url || !key) throw new Error("Missing Supabase env vars")`; test smoke verifica que clientes se crean sin error (mock env vars). |
| **Middleware `updateSession` no refresca cookies correctamente (cookies no persistidas)** | Media | Alto (usuario deslogueado en Server Components) | Verificar `config.matcher` excluye solo assets estáticos; probar flujo login → navegar a `/dashboard` → Server Component lee `user` correcto. Logs en `middleware.ts` para debug. |
| **Hydration mismatch entre Server/Client Components (theme, session)** | Media | Medio (parpadeo UI, errores consola) | `ThemeProvider` con `attribute="class"` + `defaultTheme="system"` + `enableSystem`; `SessionProvider` solo en Client Components; `suppressHydrationWarning` en `<html>` solo si necesario. Probar dev + build. |
| **shadcn/ui components no generados / CLI version mismatch** | Baja | Medio (componentes UI faltantes, estilos rotos) | Usar `npx shadcn-ui@latest add ... --yes` en step 22; si falla, crear manualmente componentes base (Button, Card, Dialog, Input, Label, Textarea, Select, Tabs, Avatar, Badge, Skeleton, Tooltip) copiando de shadcn/ui docs versión compatible. Verificar `components.json` config correcta. |
| **Tipos TypeScript `Book`/`Note` drift vs Pydantic models (feature 007)** | Media | Medio (type errors en API calls, runtime bugs) | Revisar `spec/features/007-pydantic-models/spec.md` y replicar exactamente; añadir comentario `// Sync with apps/api/app/models/*.py` en `src/types/index.ts`; future: script de sync automático. |
| **Tailwind CSS variables (shadcn) no aplicadas en `globals.css` → dark mode roto** | Media | Medio (colores incorrectos, sin dark mode) | Verificar `globals.css` incluye `:root` y `.dark` con todas las variables shadcn (`--background`, `--foreground`, `--primary`, `--secondary`, `--accent`, `--muted`, `--border`, `--ring`, `--radius`); `tailwind.config.ts` tiene `darkMode: "class"`; probar toggle tema manual. |
| **`npm run build` falla por `output: "standalone"` (config incorrecta, archivos faltantes)** | Media | Alto (Docker build falla, deploy roto) | Verificar `next.config.mjs` tiene `output: "standalone"`; `Dockerfile` copia `.next/standalone` + `.next/static` + `public`; probar build local y Docker build antes de considerar paso 35 completado. |
| **ESLint/Prettier conflicts (Tailwind class sorting, import order, unused vars)** | Baja | Bajo (CI falla, noise en PRs) | Configurar `.eslintrc.json` extendiendo `next/core-web-vitals` + `plugin:tailwindcss/recommended`; `prettier.config.js` con `plugins: ["prettier-plugin-tailwindcss"]`; `npm run lint` pasa en step 36. |
| **Vitest + jsdom no renderiza Server Components correctamente (next/headers, next/navigation mocks)** | Media | Medio (tests frágiles, falsos positivos) | Mocks completos en `vitest.setup.ts` para `next/navigation` (`useRouter`, `usePathname`, `useSearchParams`) y `next/headers` (`cookies`); tests solo cubren Client Components y utils; Server Components se testean indirectamente via integration tests futuros. |
| **Docker healthcheck no definido / container marked unhealthy** | Media | Alto (Render/Vercel restart loop) | `Dockerfile` no incluye `HEALTHCHECK` (Next.js standalone no tiene endpoint `/health` por defecto); documentar que deploy usa platform healthchecks (Render: HTTP GET `/`); opcional: añadir `app/health/route.ts` si requerido. |

## Validación

La feature se considera completa cuando **todos** los siguientes comandos pasan en orden desde `apps/web/`:

```bash
# 1. Instalación de dependencias
npm install

# 2. Arranque local y verificación manual
npm run dev
# → http://localhost:3000 carga sin errores consola (TS/ESLint)
# → Redirige a /login (no authed) → muestra placeholder "Login - Feature 012"
# → Navegación manual a /dashboard → redirige a /login (middleware protege route group)
# → Verificar dark mode toggle (si se implementa placeholder) / theme CSS variables aplicadas

# 3. Build producción (standalone output)
npm run build
# → Compila exitosamente (sin errores TypeScript)
# → Genera .next/standalone/ con server.js + node_modules mínimos
# → Genera .next/static/ con assets hasheados

# 4. Lint + Format
npm run lint
# → ESLint + Prettier pasan sin warnings/errors

# 5. Tests (Vitest + React Testing Library)
npm run test
# → src/app/page.test.tsx PASSED (redirect logic)
# → src/lib/supabase/client.test.ts PASSED (singleton memoized)
# → src/components/providers/SessionProvider.test.tsx PASSED (context)

# 6. Build Docker + verificación manual
docker build -t bookshelf-web .
docker run --rm -d -p 3000:3000 --name web-test bookshelf-web
sleep 10
curl -f http://localhost:3000  # → 200 OK, HTML válido
docker stop web-test

# 7. Verificar variables de entorno (sin secretos reales)
# Crear .env.local con valores dummy para test local
cp .env.example .env.local
# Editar .env.local con valores dummy
npm run dev  # → No error "Missing Supabase env vars"
```

**Criterios de aceptación mapeados a validación:**

| Criterio (spec.md) | Validación |
|---------------------|------------|
| `npm run dev` arranca en puerto 3000 sin errores TypeScript/ESLint | Paso 2 |
| `npm run build` compila exitosamente (standalone output para Docker) | Paso 3 + 6 |
| `npm run lint` pasa (ESLint + Prettier) | Paso 4 |
| `src/lib/supabase/client.ts` exporta `createBrowserClient` memoizado; `server.ts` exporta `createServerClient` con `cookies()` de `next/headers` | Implementación pasos 10, 11 + test paso 5 |
| `src/app/providers.tsx` envuelve `SessionProvider` + `Toaster` (sonner) + `ThemeProvider` (next-themes) | Implementación paso 15 + verificación visual paso 2 |
| `middleware.ts` en raíz usa `updateSession` para refrescar cookies de auth en cada request (server components) | Implementación pasos 12, 13 + verificación manual paso 2 (navegación protegida) |
| `components.json` configurado: style "new-york", rsc=true, tsx=true, tailwind css variables, alias `@/components/ui` | Implementación paso 8 |
| Tipos `Book`, `Note`, `BookMetadata`, `ChatRequest`, `ChatResponseChunk` en `src/types/index.ts` (espejo de Pydantic models) | Implementación paso 24 |
| `globals.css` incluye `@tailwind base/components/utilities` + shadcn CSS variables (light/dark) | Implementación paso 14 + verificación visual paso 2 |

---

**Próximo paso**: Una vez aprobado este plan, el **descomponedor** generará `tasks.md` con checklist granular para el implementador.