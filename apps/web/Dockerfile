# ============================================================
# Bookshelf Web — Dockerfile multi-stage (Next.js standalone)
# builder:  instala deps y compila (output standalone)
# runtime:  node:20-alpine, usuario no-root, solo archivos necesarios
# ============================================================

# ---- Stage 1: builder ----------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Copia manifests primero (cache de capas de `npm ci`).
COPY package.json package-lock.json ./
RUN npm ci

# Código y configuración.
COPY . .

# Compila producción (standalone output en .next/standalone).
RUN npm run build

# ---- Stage 2: runtime ------------------------------------------------------
FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Usuario no-root (convención: `nextjs`, uid 1001).
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

# Copia solo lo necesario del standalone output.
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]