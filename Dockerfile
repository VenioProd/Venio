# Stage 1: Build frontend
FROM node:22-alpine AS frontend-build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Build backend
FROM node:22-alpine AS backend-build
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/tsconfig.json ./tsconfig.json
COPY backend/src ./src
RUN npx tsc

# Stage 3: Production
FROM node:22-alpine
WORKDIR /app

# wget pour le HEALTHCHECK (déjà fourni par alpine via busybox)
# Pas besoin d'install : `wget` est builtin

# Copy compiled backend
COPY --from=backend-build /app/dist ./dist
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

# Copy frontend build
COPY --from=frontend-build /app/dist ./public

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Healthcheck Docker — interroge /api/health enrichi (chantier #5 audit 2026-05-26)
# Retourne 200 si Mongo OK, 503 si dégradé. Le swap dans deploy-ionos.yml utilise ce signal.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --quiet --tries=1 --spider --server-response http://localhost:${PORT:-3000}/api/health 2>&1 | grep -q "200" || exit 1

CMD ["node", "dist/index.js"]
