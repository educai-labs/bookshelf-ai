# 011 · Next.js UI Scaffold — Checklist de Tareas

**Estado:** en curso  
**Se basa en:** `plan.md` y `spec.md`

---

## Checklist principal

Estas tareas están ordenadas para fluidez de implementación. Cada tarea es una acción pequeña y accionable que puede marcarse como `[x]` al completarse.

- [x] **T1:** Crear estructura de directorios `apps/web/src/{app/(auth),app/(dashboard),app/providers,components/{ui,layout,providers},lib/{supabase,utils,validations},hooks,types}` + archivos `__init__` vacíos donde aplique
  > Nota: `__init__.py` no aplica en un proyecto TypeScript/Next.js (no hay paquetes Python).
- [x] **T2:** Inicializar `package.json` con dependencias: `next@14`, `react@18`, `react-dom@18`, `typescript`, `@types/react`, `@types/node`, `@supabase/ssr`, `@supabase/supabase-js`, `sonner`, `next-themes`, `zod`, `lucide-react`, `clsx`, `tailwind-merge`, `eslint`, `prettier`, `eslint-config-next`, `eslint-plugin-tailwindcss`, `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`, `vitest`, `@testing-library/react`, `jsdom`, `@types/jsdom`
  > Se añadieron además (necesarias para Tailwind, shadcn/ui y Vitest): `tailwindcss`, `postcss`, `autoprefixer`, `@vitejs/plugin-react`, `@testing-library/jest-dom`, `@testing-library/dom`, radix primitives + `class-variance-authority` (requeridas por los componentes shadcn/ui base), `prettier-plugin-tailwindcss`.
- [x] **T3:** Crear `tsconfig.json` estricto: `target: "ES2017"`, `lib: ["dom", "dom.iterable", "esnext"]`, `strict: true`, `noEmit: true`, `esModuleInterop: true`, `module: "esnext"`, `moduleResolution: "bundler"`, `resolveJsonModule: true`, `isolatedModules: true`, `jsx: "preserve"`, `incremental: true`, `plugins: [{name: "next"}]`, `paths: {"@/*": ["./src/*"]}`
- [x] **T4:** Crear `next.config.mjs`: `output: "standalone"`, `experimental: {serverActions: {bodySizeLimit: "2mb"}}`, `images: {remotePatterns: [{protocol: "https", hostname: "*.supabase.co"}]}`
- [x] **T5:** Crear `tailwind.config.ts`: `content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"]`, `theme: {extend: {colors: {primary: {...}, accent: {...}}, fontFamily: {sans: ["Inter", "system-ui"], mono: ["JetBrains Mono", "monospace"]}}`, `plugins: []`, `darkMode: "class"`
  > Se incluyó la paleta shadcn completa (border/input/ring/background/foreground/secondary/muted/popover/card/destructive + primary blue-600 + accent amber-500) mapeada a CSS variables.
- [x] **T6:** Crear `postcss.config.mjs`: `plugins: {tailwindcss: {}, autoprefixer: {}}`
- [x] **T7:** Crear `.env.example`: `NEXT_PUBLIC_SUPABASE_URL=`, `NEXT_PUBLIC_SUPABASE_ANON_KEY=`
- [x] **T8:** Crear `components.json` (shadcn/ui config): `{"$schema": "https://ui.shadcn.com/schema.json", "style": "new-york", "rsc": true, "tsx": true, "tailwind": {"config": "tailwind.config.ts", "css": "src/app/globals.css", "baseColor": "slate", "cssVariables": true}, "aliases": {"components": "@/components", "utils": "@/lib/utils", "ui": "@/components/ui", "lib": "@/lib", "hooks": "@/hooks"}}`
- [x] **T9:** Crear `src/lib/utils.ts`: `cn(...inputs)` usando `clsx` + `tailwind-merge`; `formatDate(date: string | Date, options?: Intl.DateTimeFormatOptions)`
- [x] **T10:** Crear `src/lib/supabase/client.ts`: `createBrowserClient` memoizado con `createBrowserClient` de `@supabase/ssr` — singleton exportado `supabase`
- [x] **T11:** Crear `src/lib/supabase/server.ts`: `createServerClient` usando `createServerClient` de `@supabase/ssr` + `cookies()` de `next/headers` — exporta `createServerClient` function
- [x] **T12:** Crear `src/lib/supabase/middleware.ts`: `updateSession` exportado — usa `createServerClient` + `cookies()` para refrescar sesión en cada request
- [x] **T13:** Crear `middleware.ts` en raíz: `export { updateSession as middleware } from "./src/lib/supabase/middleware"`; `export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)"] }`
- [x] **T14:** Crear `src/app/globals.css`: `@tailwind base; @tailwind components; @tailwind utilities;` + shadcn CSS variables (`:root` y `.dark` con `--background`, `--foreground`, `--primary`, `--secondary`, `--accent`, `--muted`, `--border`, `--ring`, `--radius`)
- [x] **T15:** Crear `src/app/providers.tsx` (Client Component): `SessionProvider` (contexto propio, ya que `@supabase/ssr@0.12` no exporta `SessionProvider`), `Toaster` (sonner), `ThemeProvider` (next-themes, `attribute="class"`, `defaultTheme="system"`, `enableSystem`); exporta `Providers` wrapper
- [x] **T16:** Crear `src/app/layout.tsx`: importa `globals.css`, fuentes `Inter` + `JetBrains_Mono` de `next/font/google` (`variable: "--font-sans"`, `variable: "--font-mono"`), envuelve children en `<Providers>`; metadata básica (title, description)
- [x] **T17:** Crear `src/app/page.tsx`: Server Component que usa `createServerClient` → `supabase.auth.getUser()` → redirect a `/dashboard` si authed, else `/login`
- [x] **T18:** Crear route group `(auth)`: `src/app/(auth)/layout.tsx` (layout público sin sidebar/header), `src/app/(auth)/login/page.tsx` (placeholder "Login - Feature 012"), `src/app/(auth)/register/page.tsx` (placeholder "Register - Feature 012")
- [x] **T19:** Crear route group `(dashboard)`: `src/app/(dashboard)/layout.tsx` (layout protegido con Header + Sidebar), `src/app/(dashboard)/dashboard/page.tsx` (placeholder "Dashboard - Feature 013"), `src/app/(dashboard)/book/[id]/page.tsx` (placeholder "Book Detail - Feature 015")
  > **Desviación necesaria**: `page.tsx` dentro del route group resuelve a `/` (el grupo se elimina de la URL), colisionando con `src/app/page.tsx` y rompiendo el build standalone (`page_client-reference-manifest.js` ENOENT + ruta `/dashboard` inexistente). Se movió a `(dashboard)/dashboard/page.tsx` → URL `/dashboard`, cumpliendo los criterios de `spec.md` (redirect a `/dashboard`, layout protegido).
- [x] **T20:** Crear componentes layout base: `src/components/layout/Header.tsx` (Avatar + user menu placeholder), `src/components/layout/Sidebar.tsx` (navegación: Dashboard, Books, Settings), `src/components/layout/Footer.tsx` (copyright)
- [x] **T21:** Crear `src/components/providers/SessionProvider.tsx`: wrapper fino sobre `createContext` + `useContext` para sesión de usuario (acceso a `user` en Client Components sin prop-drilling)
- [x] **T22:** Inicializar shadcn/ui base components: creados manualmente (alternativa prevista en el plan si la CLI falla) → `src/components/ui/{button,card,dialog,input,label,textarea,select,tabs,avatar,badge,skeleton,tooltip}.tsx`
- [x] **T23:** Crear `src/hooks/useAuth.ts`: `useUser()` → usa `SessionProvider` context; `useSession()` → wrapper sobre el contexto alimentado por `supabase.auth.getSession()` + listener `onAuthStateChange`
- [x] **T24:** Crear `src/types/index.ts`: interfaces `Book` (id, user_id, isbn13, title, authors, cover_url, page_count, publisher, published_date, description, status, rating, started_at, finished_at, created_at, updated_at), `Note` (id, user_id, book_id, content, content_html, chunk_index, embedding, created_at), `BookMetadata` (title, authors[], cover_url, page_count, publisher, published_date, description), `ChatRequest` (message, book_ids?, top_k?), `ChatResponseChunk` (chunk, done, book_references?)
- [x] **T25:** Crear `src/lib/validations/index.ts`: exporta esquemas Zod vacíos placeholder (`bookSchema`, `noteSchema`, `chatSchema`) — se poblarán en features 012-015
- [x] **T26:** Crear `Dockerfile` multi-stage: **builder** (`node:20-alpine`, `npm ci`, `npm run build`), **runtime** (`node:20-alpine`, `COPY --from=builder /app/public ./public`, `COPY --from=builder /app/.next/standalone ./`, `COPY --from=builder /app/.next/static ./.next/static`, `USER nextjs`, `EXPOSE 3000`, `CMD ["node", "server.js"]`)
  > Se añadió la creación del usuario `nextjs` (uid 1001) en runtime (requerido por `USER nextjs`; no existe por defecto en `node:20-alpine`).
- [x] **T27:** Crear `.dockerignore`: `node_modules`, `.next`, `.git`, `*.log`, `.env*`, `Dockerfile`, `.dockerignore`, `README.md`
- [x] **T28:** Crear `vitest.config.ts`: `import { defineConfig } from "vitest/config"; import react from "@vitejs/plugin-react"; export default defineConfig({ plugins: [react()], test: { environment: "jsdom", setupFiles: ["./vitest.setup.ts"], include: ["src/**/*.test.{ts,tsx}"] } })`
  > Se añadió `resolve.alias` para `@/* → ./src/*` (necesario para resolver imports de tests) y `globals: true` (requerido por `@testing-library/jest-dom`).
- [x] **T29:** Crear `vitest.setup.ts`: `import "@testing-library/jest-dom"; import { vi } from "vitest"; vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/", useSearchParams: () => new URLSearchParams() })); vi.mock("next/headers", () => ({ cookies: () => ({ get: () => undefined, set: vi.fn(), delete: vi.fn() }) }))`
  > El mock de `cookies` incluye también `getAll: () => []` (usado por `server.ts`).
- [x] **T30:** Crear test smoke: `src/app/page.test.tsx` — render `<Page />` con mock de `createServerClient` → verifica redirect logic
- [x] **T31:** Crear test smoke: `src/lib/supabase/client.test.ts` — verifica singleton `supabase` exportado y memoizado
- [x] **T32:** Crear test smoke: `src/components/providers/SessionProvider.test.tsx` — verifica context provider/consumer
- [x] **T33:** Instalar dependencias: `cd apps/web && npm install`
- [x] **T34:** Verificar `npm run dev` arranca en puerto 3000 sin errores TypeScript/ESLint; accesible en `http://localhost:3000`; redirige a `/login` (no authed)
- [x] **T35:** Ejecutar `npm run build` → compila exitosamente, genera output `standalone` en `.next/standalone`
- [x] **T36:** Ejecutar `npm run lint` → pasa (ESLint + Prettier sin warnings)
- [x] **T37:** Ejecutar `npm run test` → tests smoke pasan (Vitest + React Testing Library)
- [x] **T38:** Build Docker: `cd apps/web && docker build -t bookshelf-web . && docker run --rm -d -p 3000:3000 --name web-test bookshelf-web` → healthcheck manual en `http://localhost:3000`
  > ⚠ **No ejecutable en este entorno** (Docker no instalado). Validación equivalente realizada: el runtime standalone (`node server.js` con el output `.next/standalone` que copia el Dockerfile) arranca y responde correctamente (`/` y `/dashboard` → 307 a `/login`, `/login` → 200). El `docker build` debe ejecutarse en un entorno con Docker/CI.

---

## Validación contra criterios de aceptación de `spec.md`

- [x] **T39:** Validar que `npm run dev` arranca en puerto 3000 sin errores TypeScript/ESLint
- [x] **T40:** Validar que `npm run build` compila exitosamente (standalone output para Docker)
- [x] **T41:** Validar que `npm run lint` pasa (ESLint + Prettier sin warnings/errors)
- [x] **T42:** Validar que `src/lib/supabase/client.ts` exporta `createBrowserClient` memoizado; `server.ts` exporta `createServerClient` con `cookies()` de `next/headers`
- [x] **T43:** Validar que `src/app/providers.tsx` envuelve `SessionProvider` + `Toaster` (sonner) + `ThemeProvider` (next-themes)
- [x] **T44:** Validar que `middleware.ts` en raíz usa `updateSession` para refrescar cookies de auth en cada request (server components)
- [x] **T45:** Validar que `components.json` configurado: style "new-york", rsc=true, tsx=true, tailwind css variables, alias `@/components/ui`
- [x] **T46:** Validar que tipos `Book`, `Note`, `BookMetadata`, `ChatRequest`, `ChatResponseChunk` en `src/types/index.ts` (espejo de Pydantic models)
- [x] **T47:** Validar que `globals.css` incluye `@tailwind base/components/utilities` + shadcn CSS variables (light/dark)

---

## Mantenimiento (opcional)

_Eliminar esta sección si no aplica. Esta feature no requiere acciones recurrentes al tocarla en el futuro._

---

## Cierre administrativo

- [x] **T48:** Mover la feature a "Hecho" en `../../constitution/roadmap.md`
  > _Pendiente: según `AGENTS.md` (Fase 2, paso 8) el movimiento a "Hecho" lo ejecuta el subagente `roadmap` tras la aprobación del revisor. El implementador no modifica la constitución._

---

**Notas:**
- Tareas T1-T38 corresponden a los pasos de implementación del `plan.md` y están diseñadas para ser independientes y marcarse `[x]` completadas individualmente.
- Tareas T39-T47 aseguran que todos los criterios de `spec.md` queden cubiertos antes de mover a "Hecho".
- T48 es el cierre administrativo que permite la feature pasar al estado `hecho` en la carretera.
- **Desviaciones documentadas**: (1) dashboard movido a `(dashboard)/dashboard/page.tsx` (colisión de ruta `/` con `page.tsx` raíz — ver T19); (2) componentes shadcn/ui creados manualmente (alternativa del plan); (3) `providers.tsx` usa `SessionProvider` propio (`@supabase/ssr@0.12` no exporta `SessionProvider`); (4) env vars `NEXT_PUBLIC_*` leídas con acceso estático + helper `requireEnv` (requisito de inlining de Next.js para `output: "standalone"`); (5) T38 validado vía runtime standalone (Docker no disponible en el entorno).