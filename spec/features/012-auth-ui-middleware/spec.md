# 012 · Auth UI + Middleware

**Estado:** hecho

## Qué hace

Desde la perspectiva del usuario, la feature proporciona un flujo de autenticación completo y sin fricción:

- Acceso a las páginas de login y registro en el área pública `(auth)`, sin necesidad de sesión previa.
- Inicio de sesión con email y password, o con Google OAuth, que otorga acceso al área protegida.
- Cierre de sesión desde el header del área dashboard.
- Feedback visual inmediato (toasts) ante cualquier éxito, error o estado de loading en las acciones de autenticación.
- El área `(dashboard)` permanece protegida y oculta automáticamente cuando el usuario no tiene sesión activa.

## Por qué

Auth es la puerta de entrada al sistema. Separar `(auth)` (layout público, sin header/sidebar) de `(dashboard)` (layout protegido) mantiene la UX limpia y evita que componentes server roten datos sin sesión. El middleware en edge/runtime asegura que solo usuarios autenticados accedan a funcionalidades protegidas. Google + Email son los únicos proveedores confirmados, alineado con la decisión de la misión de limitar proveedores OAuth a los esenciales.

## Criterios de aceptación

- [ ] Página `login` con formulario email/password y botón Google; `useRouter` redirige a `/dashboard` tras login exitoso.
- [ ] Página `register` con formulario register y botón Google; `signUp` muestra mensaje "Revisa tu email" y link a login.
- [ ] Ruta callback `/auth/callback` (o middleware) que ejecute `exchangeCodeForSession` y redirija a `/dashboard`.
- [ ] `middleware.ts`: `export { updateSession as middleware } from '@/lib/supabase/middleware'` + `matcher: ['/dashboard/:path*', '/book/:path*']` protege rutas requeriendo sesión.
- [ ] `SessionProvider` provee `session` y `user` a todo el árbol `(dashboard)` sin errores de contexto.
- [ ] Header en layout `(dashboard)` muestra avatar/email del usuario + botón Logout que ejecuta `signOut()` y `router.push('/login')`.
- [ ] Toasts (sonner) para feedback: éxito, error y states de loading en botones de login/register/logout.
- [ ] Tests: Cypress/Playwright o unitarios con RTL — login email/password, login Google (mock), logout, middleware redirige sin sesión y permite con sesión.

## Fuera de alcance

- Recuperación de contraseña (reset password) — feature futura.
- MFA / 2FA.
- Gestión de perfil (cambiar email, password, avatar) — feature futura.
- Proveedores OAuth adicionales (GitHub, Discord, etc.) — decisión usuario: solo Google + Email.
- Middleware en API routes (backend maneja su propia auth vía JWT).
- Soporte para múltiples tenants o accounts vinculados por usuario.