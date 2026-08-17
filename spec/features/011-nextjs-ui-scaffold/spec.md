# 011 · Next.js UI Scaffold

**Estado:** propuesta

## Qué hace

Inicializa la aplicación Next.js 14+ (App Router) en `apps/web/` con TypeScript, Tailwind CSS, shadcn/ui, y configuración base de Supabase (browser + server clients), proveedores de sesión, y layout raíz.

Estructura:
```
apps/web/
├── src/
│   ├── app/
│   │   ├── layout.tsx            # Root layout: providers, fonts, globals.css
│   │   ├── page.tsx              # Redirect a /dashboard (o /login si no authed)
│   │   ├── globals.css           # Tailwind directives + shadcn CSS variables
│   │   ├── providers.tsx         # Client component: SessionProvider, Toaster, ThemeProvider
│   │   ├── (auth)/               # Route group: login, register (feature 012)
│   │   └── (dashboard)/          # Route group protegido: dashboard, book/[id] (features 013, 015)
│   ├── components/
│   │   ├── ui/                   # shadcn/ui components (button, card, dialog, etc.)
│   │   ├── layout/               # Header, Sidebar, Footer
│   │   └── providers/            # SessionProvider wrapper
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts         # createBrowserClient (singleton)
│   │   │   ├── server.ts         # createServerClient (cookies)
│   │   │   └── middleware.ts     # updateSession (para middleware.ts)
│   │   ├── utils.ts              # cn(), formatDate(), etc.
│   │   └── validations/          # Zod schemas (feature 012+)
│   ├── hooks/
│   │   └── useAuth.ts            # useUser(), useSession() wrappers
│   └── types/
│       └── index.ts              # Types compartidos (Book, Note, etc.)
├── components.json               # shadcn/ui config
├── tailwind.config.ts
├── tsconfig.json
├── next.config.mjs
├── package.json
├── .env.example                  # NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
└── Dockerfile                    # (opcional, para deploy standalone)
```

## Por qué

Scaffold completo evita decisiones repetidas en cada feature UI. Route groups `(auth)` y `(dashboard)` separan layouts público/protegido. Supabase clients diferenciados (browser vs server) siguen mejores prácticas Next.js 14. `providers.tsx` centraliza providers React (Session, Theme, Toasts).

## Criterios de aceptación

- [ ] `npm run dev` arranca en puerto 3000 sin errores TypeScript/ESLint.
- [ ] `npm run build` compila exitosamente (standalone output para Docker).
- [ ] `npm run lint` pasa (ESLint + Prettier).
- [ ] `src/lib/supabase/client.ts` exporta `createBrowserClient` memoizado; `server.ts` exporta `createServerClient` con `cookies()` de `next/headers`.
- [ ] `src/app/providers.tsx` envuelve `SessionProvider` (de `@supabase/auth-helpers-nextjs` o similar) + `Toaster` (sonner) + `ThemeProvider` (next-themes).
- [ ] `middleware.ts` en raíz usa `updateSession` para refrescar cookies de auth en cada request (server components).
- [ ] `components.json` configurado: style "new-york", rsc=true, tsx=true, tailwind css variables, alias `@/components/ui`.
- [ ] Tipos `Book`, `Note`, `BookMetadata`, `ChatRequest`, `ChatResponseChunk` en `src/types/index.ts` (espejo de Pydantic models).
- [ ] `globals.css` incluye `@tailwind base/components/utilities` + shadcn CSS variables (light/dark).

## Fuera de alcance

- Páginas `/login`, `/register` (feature 012).
- Dashboard grid, book detail, modals (features 013-015).
- Componentes UI customizados más allá de shadcn base.
- Tests E2E (Cypress/Playwright) — feature futura.
- Despliegue Vercel (feature 020).