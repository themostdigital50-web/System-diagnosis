# syntax=docker/dockerfile:1

ARG NODE_VERSION=24.17.0

################################################################################
# Base image shared by every stage.
################################################################################
FROM node:${NODE_VERSION}-alpine AS base
WORKDIR /usr/src/app

################################################################################
# Production dependencies. npm workspaces need the root lockfile AND every
# workspace manifest before `npm ci` will accept the tree.
################################################################################
FROM base AS deps
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev

################################################################################
# Build stage: full dev toolchain, then compile both workspaces.
################################################################################
FROM deps AS build
COPY . .
# The lockfile was generated on Windows and only contains that platform's
# optional native binaries (npm/cli#4828). A fresh install resolves the
# correct Rollup/esbuild binaries for the Linux container.
RUN --mount=type=cache,target=/root/.npm \
    rm -rf node_modules package-lock.json && \
    npm install --no-package-lock && \
    npm run typecheck && \
    npm run build

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
CMD ["node", "dist/index.js"]
