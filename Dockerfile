# syntax=docker/dockerfile:1

# ---- Build stage: install deps, build web + server ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY server/package.json ./server/
COPY web/package.json ./web/
RUN npm install
COPY . .
RUN npm run build

# ---- Runtime stage ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# git + git-lfs are required for vault sync
RUN apk add --no-cache git git-lfs && git lfs install --system

# Install production deps for the server workspace only
COPY package.json package-lock.json* ./
COPY server/package.json ./server/
RUN npm install --omit=dev --workspace server

# Copy built artifacts
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/public ./server/public

ENV PORT=8787 \
    HOST=0.0.0.0 \
    DATA_DIR=/data \
    VAULT_PATH=/vault \
    ALLOWED_ROOTS=/vault \
    NODE_OPTIONS=--max-old-space-size=4096

VOLUME ["/vault", "/data"]
EXPOSE 8787

# IPv4 literal: "localhost" resolves to ::1 in this image while the server binds IPv4 only,
# and busybox wget does not fall back to the next address, so the probe fails forever.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:8787/healthz || exit 1

CMD ["node", "server/dist/index.js"]
