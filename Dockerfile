# syntax=docker/dockerfile:1

# ---- Build stage: install deps, build web + server ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY server/package.json ./server/
COPY web/package.json ./web/
COPY desktop/package.json ./desktop/
# Every workspace in the lockfile needs its package.json present before `npm install`,
# otherwise its dependencies are never installed and the workspace build fails (mcp-server
# needs @modelcontextprotocol/sdk + zod at build time).
COPY mcp-server/package.json ./mcp-server/
COPY packages/webo/package.json ./packages/webo/
RUN ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci
COPY . .
RUN npm run build

# ---- Runtime stage ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Git commit this image was built from, injected by deploy/deploy.sh (--build-arg GIT_SHA=…)
# and surfaced by GET /healthz as `build`, so "which version is running?" is one curl away.
ARG GIT_SHA=dev
ENV WEBOBSIDIAN_BUILD_SHA=$GIT_SHA

# git + git-lfs are required for vault sync
RUN apk add --no-cache git git-lfs && git lfs install --system

# Install production deps for the server workspace only
COPY package.json package-lock.json* ./
COPY server/package.json ./server/
COPY web/package.json ./web/
COPY desktop/package.json ./desktop/
COPY mcp-server/package.json ./mcp-server/
COPY packages/webo/package.json ./packages/webo/
RUN npm ci --omit=dev --workspace server

# Copy built artifacts
COPY --from=build /app/mcp-server/dist ./mcp-server/dist
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

# IPv4 literal: "localhost" resolves to ::1 in this image while the server binds IPv4.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:8787/healthz || exit 1

CMD ["node", "server/dist/index.js"]
