---
estado: "hecho"
---

# 012 · Auth UI + Middleware — Checklist de Tareas

**Estado:** hecho

## Checklist principal

### 1. Configuración Supabase Clients (lib/)

- [x] Crear `apps/web/src/lib/supabase/client.ts` con `createBrowserClient` exponiendo `signInWithPassword`, `signUp`, `signInWithOAuth`, `signOut`, `getSession`
- [x] Crear `apps/web/src/lib/supabase/server.ts` con `createServerClient` usando `next/headers` para cookies (Server Components / Route Handlers)
- [x] Crear `apps/web/src/lib/supabase/middleware.ts` que exporte `updateSession` compatible con edge runtime

### 2. Middleware de Protección (`middleware.ts`)

- [x] Crear `apps/web/middleware.ts` raíz importando `updateSession` de `@/lib/supabase/middleware`
- [x] Configurar `export const middleware = updateSession`
- [x] Configurar `export const config = { matcher: ['/dashboard/:path*', '/book/:path*'] }`
- [x] Verificar comportamiento: sesión inexistente → redirect a `/login` preservando URL original

### 3. SessionProvider (Context Provider)

- [x] Crear `apps/web/src/components/auth/SessionProvider.tsx` (Client Component)
- [x] Implementar `<SessionContext.Provider value={session}>` envolviendo children
- [x] Obtener sesión inicial via `supabase.auth.getSession()`
- [x] Suscribirse a `onAuthStateChange`
- [x] Usar en `apps/web/src/app/(dashboard)/layout.tsx` envolviendo el layout completo

### 4. Área Pública — Rutas `(auth)`

#### 4.1 Layout `(auth)/layout.tsx`

- [x] Crear layout limpio sin header/sidebar, centrado, max-w-md
- [x] Importar `Toaster` de `sonner` para toasts globales (en root layout via `Providers`)

#### 4.2 Página `login/page.tsx` (Server Component)

- [x] Crear `LoginForm` Client Component
- [x] Formulario con schema Zod: `email` (email), `password` (min 8)
- [x] Usar `react-hook-form` + `@hookform/resolvers/zod`
- [x] Botón "Iniciar sesión" → `signInWithPassword` + loading state + toast éxito/error
- [x] Botón "Continuar con Google" → `signInWithOAuth({ provider: 'google', options: { redirectTo: '/auth/callback' } })`
- [x] Link a `/register`

#### 4.3 Página `register/page.tsx`

- [x] Formulario análogo a login pero `signUp` (email/password)
- [x] Tras éxito: toast "Revisa tu email para confirmar la cuenta" + link a `/login`
- [x] Botón Google igual que login

#### 4.4 Ruta `auth/callback/route.ts`

- [x] Crear Route Handler (GET) recibiendo `code` y `next` query params
- [x] Ejecutar `supabase.auth.exchangeCodeForSession(code)`
- [x] Redirigir a `next` (default `/dashboard`) o `/login?error=...` si falla

### 5. Área Protegida — Layout `(dashboard)`

#### 5.1 Layout `(dashboard)/layout.tsx`

- [x] Importar `SessionProvider` y envolver `{children}`
- [x] Renderizar `DashboardHeader` (Client Component) + `<main>{children}</main>`

#### 5.2 Header `DashboardHeader` (`components/dashboard/DashboardHeader.tsx`)

- [x] Crear Client Component
- [x] Usar `useSession()` hook (lee de `SessionProvider` context) → `user`, `session`
- [x] Mostrar `Avatar` con iniciales/email + `DropdownMenu` (shadcn/ui)
  - Email del usuario
  - Botón "Cerrar sesión" → `signOut()` + `router.push('/login')` + toast éxito

#### 5.3 Hook `useSession` (`lib/hooks/useAuth.ts`)

- [x] Crear hook que lee `session` de `SessionContext`
- [x] Retornar `{ user: session?.user, session }`

### 6. Toasts (sonner)

- [x] Añadir `Toaster` en `(auth)/layout.tsx` y `(dashboard)/layout.tsx` (o root layout)
- [x] Usar `toast.success()`, `toast.error()`, `toast.loading()` en Client Components

### 7. Tests (Vitest + React Testing Library)

- [x] Test: Login email/password — submit form → llama `signInWithPassword` → toast éxito → router.push `/dashboard`
- [x] Test: Login Google (mock) — click Google → llama `signInWithOAuth` con `redirectTo: '/auth/callback'`
- [x] Test: Register email/password — submit → `signUp` → toast "Revisa tu email" → link login
- [x] Test: Logout — click logout → `signOut` → router.push `/login` → toast éxito
- [x] Test: Middleware redirect sin sesión — request a `/dashboard` sin cookie → response 307 redirect a `/login?redirectTo=/dashboard`
- [x] Test: Middleware permite con sesión — request con cookie válida → `NextResponse.next()` (pasa)

### 8. Variables de Entorno (verificación)

- [x] Confirmar en `.env.example`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`
- [x] Documentar en README local cómo configurar Google OAuth en Supabase Dashboard (Authorized redirect URLs: `https://<project>.supabase.co/auth/v1/callback`)

---

## Criterios de validación

- [x] `npm run lint` pasa (ESLint + Prettier)
- [x] `npm run test` pasa (Vitest, coverage ≥ 80% en auth components)
- [x] `npm run build` genera build de producción sin errores
- [ ] Manual: login email/password → redirige a `/dashboard` *(cubierto por unit tests; requiere entorno Supabase vivo)*
- [ ] Manual: login Google → callback → `/dashboard` *(requiere Google OAuth configurado en Supabase Dashboard)*
- [ ] Manual: register → email confirmación → login → `/dashboard` *(requiere envío de email real)*
- [ ] Manual: logout → `/login` *(cubierto por unit tests)*
- [ ] Manual: acceso a `/dashboard` sin sesión → redirect `/login` *(cubierto por unit test de middleware)*
- [ ] Manual: acceso a `/dashboard` con sesión → contenido visible *(cubierto por unit test de middleware)*
- [x] Toasts aparecen en todos los flujos (éxito, error, loading) *(cubierto por unit tests)*