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

# Copy compiled backend
COPY --from=backend-build /app/dist ./dist
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

# Copy frontend build
COPY --from=frontend-build /app/dist ./public

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000
CMD ["node", "dist/index.js"]
