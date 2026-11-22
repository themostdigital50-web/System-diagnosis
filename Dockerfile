# syntax=docker/dockerfile:1

ARG NODE_VERSION=24.17.0

################################################################################
# Base image shared by every stage.
################################################################################
FROM node:${NODE_VERSION}-alpine AS base
WORKDIR /usr/src/app

################################################################################
# Production dependencies. All workspace manifests are required for npm to
# resolve the monorepo tree. The lockfile is intentionally ignored because it
# was generated on Windows and lacks Linux native binaries (npm/cli#4828).
################################################################################
FROM base AS deps
COPY package.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN --mount=type=cache,target=/root/.npm \
    npm install --no-package-lock --omit=dev --no-audit --no-fund

################################################################################
# Build stage: full dev toolchain, then compile both workspaces.
# Kept independent from `deps` so the prod and dev trees install in parallel and
# neither has to delete and reinstall node_modules.
################################################################################
FROM base AS build
COPY package.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN --mount=type=cache,target=/root/.npm \
    npm install --no-package-lock --no-audit --no-fund
COPY . .
RUN npm run typecheck && npm run build

################################################################################
# Runtime image: compiled output + production dependencies only.
################################################################################
FROM base AS final
ENV NODE_ENV=production

# Native tools used by the Diagnostics page inside the container.
RUN apk add --no-cache iputils bind-tools traceroute

USER node
WORKDIR /usr/src/app

COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/server/dist ./server/dist
COPY --from=build /usr/src/app/client/dist ./client/dist

# config.clientDist is resolved relative to cwd, so run from the server workspace.
WORKDIR /usr/src/app/server

EXPOSE 3001
ENV HOST=0.0.0.0
ENV PORT=3001
CMD ["node", "dist/index.js"]
