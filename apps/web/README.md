# Bookshelf Web (Next.js frontend)

Frontend Next.js 14 (App Router) de Bookshelf — gestor personal de biblioteca con
búsqueda semántica. Autenticación con **Supabase Auth** (Email/Password + Google OAuth).

## Variables de entorno

Copia `.env.example` a `.env.local` y rellena los valores:

| Variable                        | Descripción                                             | Dónde obtenerla                     |
| ------------------------------- | ------------------------------------------------------- | ----------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | URL del proyecto Supabase (`https://<ref>.supabase.co`) | Supabase Dashboard → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave pública `anon` (segura para el frontend)          | Supabase Dashboard → Settings → API |
| `NEXT_PUBLIC_SITE_URL`          | URL pública de la app (local: `http://localhost:3000`)  | Tú — define la URL de despliegue    |

> Nunca subas `.env.local` al repositorio (ver `.gitignore`).

## Configurar Google OAuth en Supabase

1. **Google Cloud Console**: crea un proyecto y configura la pantalla de
   consentimiento OAuth (External). Crea una credencial **OAuth Client ID**
   (tipo _Web application_).
   - **Authorized redirect URIs** (Google): añade
     `https://<project-ref>.supabase.co/auth/v1/callback`.
2. **Supabase Dashboard → Authentication → Providers → Google**:
   - Activa Google.
   - Pega el **Client ID** y **Client Secret** de Google Cloud.
   - Guarda.
3. **Supabase Dashboard → Authentication → URL Configuration**:
   - **Site URL**: `NEXT_PUBLIC_SITE_URL` (ej. `http://localhost:3000` en local).
   - **Redirect URLs**: añade `<NEXT_PUBLIC_SITE_URL>/auth/callback`.
4. Reinicia el servidor de desarrollo y prueba "Continuar con Google".

### Flujo de autenticación

- `/login` y `/register` — área pública `(auth)` (email/password + Google).
- `/auth/callback` — Route Handler que canjea `code` por sesión
  (`exchangeCodeForSession`) y redirige a `/dashboard`.
- `/dashboard` y `/book/*` — protegidas por `middleware.ts` (edge) que valida
  sesión vía `updateSession` y redirige a `/login?redirectTo=<url>` si no hay.
- `SessionProvider` (Client) provee `session`/`user` al árbol `(dashboard)`;
  `DashboardHeader` muestra avatar/email y permite cerrar sesión.

## Comandos

```bash
npm run dev     # Dev server (puerto 3000)
npm run test    # Vitest (unit tests + coverage de componentes auth)
npm run lint    # ESLint + Prettier
npm run build   # Build de producción
```
