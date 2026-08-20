# 012 · Auth UI + Middleware — Plan de Implementación

**Estado:** en curso

## Enfoque

Implementar autenticación completa en el frontend Next.js (App Router) usando Supabase Auth con dos proveedores: Email/Password y Google OAuth. La arquitectura separa claramente el área pública `(auth)` —login, register, callback— del área protegida `(dashboard)` mediante middleware de Next.js en edge runtime que valida sesión via `updateSession` de Supabase. El `SessionProvider` envuelve el layout `(dashboard)` para proveer `session`/`user` a componentes cliente. Feedback visual con `sonner` toasts. Tests con Vitest + React Testing Library para flujos críticos.

Decisiones clave alineadas con `tech-stack.md`:
- **Supabase client browser** (`@supabase/supabase-js`) en `lib/supabase/client.ts` para auth client-side.
- **Supabase client server** (`createServerClient`) en `lib/supabase/server.ts` para middleware y Server Components.
- **Middleware** en `middleware.ts` raíz usando `updateSession` exportado desde `lib/supabase/middleware.ts`.
- **Rutas auth** bajo `(auth)`: `/login`, `/register`, `/auth/callback`.
- **Componentes UI**: shadcn/ui (Button, Card, Input, Label, Avatar, Toast via sonner).
- **Variables de entorno**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (ya en `.env.example`).

## Implementación

### 1. Configuración Supabase Clients (lib/)

| Archivo | Responsabilidad |
|---------|-----------------|
| `apps/web/src/lib/supabase/client.ts` | Cliente browser singleton (`createBrowserClient`) para `signInWithPassword`, `signUp`, `signInWithOAuth`, `signOut`, `getSession`. |
| `apps/web/src/lib/supabase/server.ts` | `createServerClient` para Server Components / Route Handlers (cookies via `next/headers`). |
| `apps/web/src/lib/supabase/middleware.ts` | Exporta `updateSession` (edge-compatible) que refresca sesión y devuelve `NextResponse`. |

### 2. Middleware de Protección (`middleware.ts`)

- Ubicación: `apps/web/middleware.ts` (raíz del proyecto Next.js).
- Importa `updateSession` de `@/lib/supabase/middleware`.
- `export const middleware = updateSession`.
- `export const config = { matcher: ['/dashboard/:path*', '/book/:path*'] }`.
- Comportamiento: si no hay sesión → redirige a `/login` con `redirectTo` preservando URL original.

### 3. SessionProvider (Context Provider)

- Archivo: `apps/web/src/components/auth/SessionProvider.tsx`.
- Cliente (`'use client'`) que envuelve `children` con `<SessionContext.Provider value={session}>`.
- Obtiene sesión inicial via `supabase.auth.getSession()` y suscribe a `onAuthStateChange`.
- Se usa en `apps/web/src/app/(dashboard)/layout.tsx` envolviendo el layout completo.

### 4. Área Pública — Rutas `(auth)`

#### Layout `(auth)/layout.tsx`
- Layout limpio sin header/sidebar, centrado, max-w-md.
- Importa `Toaster` de `sonner` para toasts globales.

#### Página `login/page.tsx`
- Server Component que renderiza `LoginForm` (Client Component).
- `LoginForm`:
  - Formulario con Zod schema: `email` (email), `password` (min 8).
  - `react-hook-form` + `@hookform/resolvers/zod`.
  - Botón "Iniciar sesión" → `signInWithPassword` + loading state + toast éxito/error.
  - Botón "Continuar con Google" → `signInWithOAuth({ provider: 'google', options: { redirectTo: '/auth/callback' } })`.
  - Link a `/register`.

#### Página `register/page.tsx`
- Análoga a login pero `signUp` (email/password).
- Tras éxito: toast "Revisa tu email para confirmar la cuenta" + link a `/login`.
- Botón Google igual que login.

#### Ruta `auth/callback/route.ts`
- Route Handler (GET) que recibe `code` y `next` query params.
- `supabase.auth.exchangeCodeForSession(code)`.
- Redirige a `next` (default `/dashboard`) o `/login?error=...` si falla.

### 5. Área Protegida — Layout `(dashboard)`

#### Layout `(dashboard)/layout.tsx`
- Importa `SessionProvider` y envuelve `{children}`.
- Renderiza `DashboardHeader` (Client Component) + `<main>{children}</main>`.

#### Header `DashboardHeader` (`components/dashboard/DashboardHeader.tsx`)
- Client Component.
- `useSession()` hook (lee de `SessionProvider` context) → `user`, `session`.
- Muestra `Avatar` con iniciales/email + `DropdownMenu` (shadcn/ui) con:
  - Email del usuario.
  - Botón "Cerrar sesión" → `signOut()` + `router.push('/login')` + toast éxito.

#### Hook `useSession` (`lib/hooks/useSession.ts`)
- `const { data: session } = useContext(SessionContext)`.
- Retorna `{ user: session?.user, session }`.

### 6. Toasts (sonner)

- `Toaster` en `(auth)/layout.tsx` y `(dashboard)/layout.tsx` (o root layout).
- Uso en Client Components: `toast.success()`, `toast.error()`, `toast.loading()` (promise-based para async actions).

### 7. Tests (Vitest + React Testing Library)

| Test | Archivo | Qué valida |
|------|---------|------------|
| Login email/password | `apps/web/src/app/(auth)/login/LoginForm.test.tsx` | Submit form → llama `signInWithPassword` → toast éxito → router.push `/dashboard`. |
| Login Google (mock) | `apps/web/src/app/(auth)/login/LoginForm.test.tsx` | Click Google → llama `signInWithOAuth` con `redirectTo: '/auth/callback'`. |
| Register email/password | `apps/web/src/app/(auth)/register/RegisterForm.test.tsx` | Submit → `signUp` → toast "Revisa tu email" → link login. |
| Logout | `apps/web/src/components/dashboard/DashboardHeader.test.tsx` | Click logout → `signOut` → router.push `/login` → toast éxito. |
| Middleware redirect sin sesión | `apps/web/middleware.test.ts` (unit test con `next-test-utils` o mock `NextRequest`) | Request a `/dashboard` sin cookie → response 307 redirect a `/login?redirectTo=/dashboard`. |
| Middleware permite con sesión | `apps/web/middleware.test.ts` | Request con cookie válida → `NextResponse.next()` (pasa). |

> **Nota**: Tests de middleware pueden usar `next-test-utils` (integración) o mockear `createServerClient`/`updateSession` para unitarios rápidos. Se prioriza unitarios con mocks por velocidad.

### 8. Variables de Entorno (verificación)

- Confirmar en `.env.example`:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `NEXT_PUBLIC_SITE_URL` (para `redirectTo` en OAuth).
- Documentar en README local cómo configurar Google OAuth en Supabase Dashboard (Authorized redirect URLs: `https://<project>.supabase.co/auth/v1/callback`).

## Decisiones

| Decisión | Justificación | Alternativa descartada |
|----------|---------------|------------------------|
| `updateSession` en middleware (edge) | Recomendado por Supabase para App Router; refresca tokens automáticamente; edge-compatible. | Middleware custom con `getSession` manual: más código, risk de race conditions. |
| `SessionProvider` en layout `(dashboard)` | Aísla contexto auth al área protegida; evita providers innecesarios en `(auth)`. | Provider en root layout: fuerza client-side en páginas públicas, peor SEO/performance. |
| `sonner` para toasts | Ligero, accesible, API promise-based (`toast.promise`), integra con shadcn/ui. | `react-hot-toast` (menos mantenido), `shadcn/ui Toast` (más boilerplate). |
| Zod + react-hook-form | Validación declarativa, type-safe, estándar en stack. | `yup` + `formik` (más verbose), validación manual (propenso a errores). |
| Callback route `/auth/callback` (Route Handler) | Patrón estándar Supabase Next.js; maneja `code` exchange server-side. | Client-side `exchangeCodeForSession` en página: expone lógica en bundle, menos seguro. |
| Tests unitarios con mocks (no E2E Cypress/Playwright) | Velocidad, aislamiento, cobertura lógica de negocio; E2E se añadirá en feature separada si hace falta. | Cypress/Playwright: más lentos, flakiness, requieren infra. |

## Riesgos

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| **Cookies no se envían en middleware (edge)** | Sesión no detectada → redirect loop o acceso denegado. | Usar `createServerClient` con `cookies()` de `next/headers` en `updateSession`; testear en local y preview Vercel. |
| **Google OAuth redirect mismatch** | Error "redirect_uri_mismatch" en consola Google. | Verificar `NEXT_PUBLIC_SITE_URL` + `/auth/callback` en Supabase Dashboard > Auth > URL Configuration. Documentar en README. |
| **SessionProvider no provee sesión en Server Components** | `useSession` undefined en componentes cliente. | `SessionProvider` es Client Component; layout `(dashboard)` lo usa correctamente. Verificar que no se use en Server Components directamente. |
| **Flash de contenido sin autenticar (FOUC)** | Usuario ve dashboard brevemente antes de redirect. | Middleware en edge bloquea antes de render; `SessionProvider` muestra loading skeleton si sesión `null` inicial. |
| **Rate limiting / abuse en auth endpoints** | Supabase bloquea IPs por muchos intentos fallidos. | Supabase maneja rate limiting nativo; no añadir capa extra salvo que se detecte problema real. |
| **Tests frágiles por mocks de Supabase** | Cambios en API Supabase rompen tests. | Mockear solo métodos usados (`signInWithPassword`, `signUp`, `signInWithOAuth`, `signOut`, `getSession`, `onAuthStateChange`, `exchangeCodeForSession`). Mantener mocks centralizados en `__mocks__/@supabase/supabase-js.ts`. |
| **Variables de entorno faltantes en CI/CD** | Build falla en GitHub Actions / Vercel. | Añadir `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` a secrets de Vercel y GitHub Actions. Verificar `.env.example` completo. |

## Validación Final (Definition of Done)

- [ ] `npm run lint` pasa (ESLint + Prettier).
- [ ] `npm run test` pasa (Vitest, coverage ≥ 80% en auth components).
- [ ] `npm run build` genera build de producción sin errores.
- [ ] Manual: login email/password → redirige a `/dashboard`.
- [ ] Manual: login Google → callback → `/dashboard`.
- [ ] Manual: register → email confirmación → login → `/dashboard`.
- [ ] Manual: logout → `/login`.
- [ ] Manual: acceso a `/dashboard` sin sesión → redirect `/login`.
- [ ] Manual: acceso a `/dashboard` con sesión → contenido visible.
- [ ] Toasts aparecen en todos los flujos (éxito, error, loading).

---

*Plan generado respetando `spec/constitution/tech-stack.md` y cubriendo todos los criterios de `spec/features/012-auth-ui-middleware/spec.md`.*