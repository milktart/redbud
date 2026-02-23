# =============================================================================
# Redbud API Dockerfile
#
# Stages:
#   development  — Hot-reload dev server (tsx watch), all deps, volume mounted
#   production   — Optimised, production deps only, non-root user
#
# Usage:
#   docker-compose up --build          # uses NODE_ENV from .env
#   NODE_ENV=production docker-compose up --build
# =============================================================================

ARG NODE_ENV=development

# ============================================================================
# Base — shared Alpine + common setup
# ============================================================================
FROM node:20-alpine AS base

WORKDIR /app

RUN apk add --no-cache python3 make g++ git

RUN npm install -g npm@11.10.0

RUN chown -R node:node /app

COPY --chown=node:node package*.json ./

# ============================================================================
# Development deps — all dependencies including devDependencies
# ============================================================================
FROM base AS development-deps

USER node
RUN npm install

# ============================================================================
# Production deps — only production dependencies
# ============================================================================
FROM base AS production-deps

USER node
RUN npm ci --omit=dev --ignore-scripts && npm rebuild bcrypt 2>/dev/null || true

# ============================================================================
# Development stage
# Hot-reload via tsx watch. Source is volume-mounted from the host.
# ============================================================================
FROM node:20-alpine AS development

WORKDIR /app

RUN apk add --no-cache git && \
    chown -R node:node /app && \
    git config --global --add safe.directory /app

COPY --from=development-deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node . .

ENV NODE_ENV=development
ENV PORT=3000

EXPOSE 3000

USER root
COPY scripts/docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "run", "dev"]

# ============================================================================
# Production stage
# Minimal image, production deps only, runs as non-root node user.
# ============================================================================
FROM node:20-alpine AS production

WORKDIR /app

RUN chown -R node:node /app

COPY --from=production-deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node . .

ENV NODE_ENV=production
ENV PORT=3000

RUN mkdir -p /app/logs && chown -R node:node /app/logs

USER root
COPY scripts/docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) })"

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
