# Build context is the REPO ROOT (see docker-compose.yml / services/mcp/railway.toml).
# All paths below are relative to the repo root, not to services/mcp/.

# ---- deps: install once, layer-cached on manifests only ----
FROM node:20-slim AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY services/mcp/package.json services/mcp/
# Add one line per workspace as they appear, e.g.:
# COPY packages/common/package.json packages/common/
RUN npm ci

# ---- build: compile TypeScript ----
FROM node:20-slim AS build
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.base.json ./
COPY services/mcp ./services/mcp
RUN npm run build --workspace @polaris/mcp

# ---- runtime: prod deps + compiled output only ----
FROM node:20-slim AS runtime
ENV NODE_ENV=production
WORKDIR /repo
COPY package.json package-lock.json ./
COPY services/mcp/package.json services/mcp/
RUN npm ci --omit=dev
COPY --from=build /repo/services/mcp/dist ./services/mcp/dist
WORKDIR /repo/services/mcp
EXPOSE 3000
CMD ["node", "dist/http.js"]