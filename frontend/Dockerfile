# =============================================================================
# Redbud Frontend Dockerfile
#
# Stages:
#   development  — Vite dev server + Nginx proxy (hot reload via volume mount)
#   production   — Nginx serves the compiled static build
#
# The correct stage is selected automatically by NODE_ENV in docker-compose.
# =============================================================================

ARG NODE_ENV=development

# ============================================================================
# Base: shared Node image used for building
# ============================================================================
FROM node:20-alpine AS node-base

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# ============================================================================
# Development stage
# Runs Vite dev server. Nginx (nginx.dev.conf) sits in front on port 80,
# proxying browser traffic to Vite and /api/* to the Express API.
# Source is volume-mounted for hot module replacement.
# ============================================================================
FROM node-base AS development

# Install Nginx alongside Node
RUN apk add --no-cache nginx gettext

# Copy dev Nginx config template (API_UPSTREAM injected at startup via envsubst)
# Alpine Nginx serves virtual hosts from http.d/, not conf.d/
COPY nginx.dev.conf /etc/nginx/templates/default.conf.template
# Remove the default Alpine Nginx virtual host to avoid conflicts
RUN rm -f /etc/nginx/http.d/default.conf

COPY docker-entrypoint.dev.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 80

ENTRYPOINT ["docker-entrypoint.sh"]

# ============================================================================
# Builder: compile the Svelte app for production
# ============================================================================
FROM node-base AS builder

ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=${VITE_API_URL}

RUN npm run build

# ============================================================================
# Production stage
# Nginx serves compiled static files and proxies /api to Express.
# API_UPSTREAM injected at startup via envsubst.
# ============================================================================
FROM nginx:alpine AS production

RUN apk add --no-cache gettext

# Copy compiled assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy production Nginx config template
COPY nginx.prod.conf /etc/nginx/templates/default.conf.template

EXPOSE 80

# nginx:alpine's default entrypoint handles envsubst via /etc/nginx/templates/
CMD ["nginx", "-g", "daemon off;"]
