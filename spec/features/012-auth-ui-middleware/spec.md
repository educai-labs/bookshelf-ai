# 012 · Auth UI + Middleware

**Estado:** propuesta

## Qué hace

Implementa flujo completo de autenticación en el frontend:
- Páginas `/login` y `/register` en route group `(auth)`.
- Google OAuth: botón "Continuar con Google" → `supabase.auth.signInWithOAuth({ provider: 'google' })` → callback automático Supabase → redirige a `/dashboard`.
- Email/Password: formulario register (email, password, confirm) → `signUp` → email verification → login; formulario login → `signInWithPassword`.
- Middleware de rutas protegidas: `middleware.ts` usa `updateSession` + verifica `session`; si no hay sesión en rutas `(dashboard)/*` → redirige a `/login?redirect=...`.
- Logout: botón en header → `supabase.auth.signOut()` → redirige a `/login`.
- Manejo de errores: toasts (sonner) para "Credenciales inválidas", "Email ya registrado", "Verifica tu email", etc.

## Por qué

Auth es la puerta de entrada. Separar `(auth)` (layout público, sin header/sidebar) de `(dashboard)` (layout protegido) mantiene UX limpia. Middleware en edge/runtime asegura que componentes server no rendericen datos sin sesión. Google + Email son los únicos proveedores confirmados (decisión usuario).

## Criterios de aceptación

- [ ] `src/app/(auth)/login/page.tsx`: formulario email/password + botón Google; `useRouter` redirige a `/dashboard` tras login exitoso.
- [ ] `src/app/(auth)/register/page.tsx`: formulario register + botón Google; `signUp` → muestra mensaje "Revisa tu email"; link a login.
- [ ] `src/app/auth/callback/route.ts` (o `middleware.ts` maneja callback): `supabase.auth.exchangeCodeForSession` → redirige a `/dashboard`.
- [ ] `middleware.ts`: `export { updateSession as middleware } from '@/lib/supabase/middleware'` + `matcher: ['/dashboard/:path*', '/book/:path*']` (rutas protegidas).
- [ ] `SessionProvider` en `providers.tsx` provee `session` y `user` a todo el árbol `(dashboard)`.
- [ ] Header en layout `(dashboard)` muestra avatar/email + botón Logout → `signOut()` → `router.push('/login')`.
- [ ] Toasts (sonner) para feedback: éxito, error, loading states en botones.
- [ ] Tests: Cypress/Playwright (o unitarios con RTL) — login email/password, login Google (mock), logout, middleware redirige sin sesión, middleware permite con sesión.

## Fuera de alcance

- Recuperación de contraseña (reset password) — feature futura.
- MFA / 2FA.
- Gestión de perfil (cambiar email, password, avatar) — feature futura.
- Proveedores OAuth adicionales (GitHub, Discord, etc.) — decisión usuario: solo Google + Email.
- Middleware en API routes (backend maneja su propia auth vía JWT).