#!/bin/sh
set -e

# Inject API_UPSTREAM into the Nginx config template
mkdir -p /etc/nginx/http.d
envsubst '${API_UPSTREAM}' < /etc/nginx/templates/default.conf.template > /etc/nginx/http.d/default.conf
# Remove any default configs that might conflict
rm -f /etc/nginx/conf.d/default.conf /etc/nginx/http.d/default.conf.bak

# Start Nginx in the background
nginx

# Start the Vite dev server in the foreground (Nginx proxies to it)
exec npm run dev -- --host 0.0.0.0
