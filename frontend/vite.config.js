import { defineConfig, loadEnv } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig(({ mode }) => {
  // Load env vars so we can use them in config
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [svelte()],
    server: {
      // Bind to all interfaces so Docker can reach it
      host: '0.0.0.0',
      port: parseInt(env.VITE_PORT) || 5173,
      // Allow any hostname — Nginx is the public entry point, Vite is internal only
      allowedHosts: true,
      // HMR: connect through the TLS-terminating reverse proxy at port 443.
      // NPM proxy host 18.conf has been updated to pass WebSocket upgrades.
      hmr: {
        clientPort: 443,
        protocol: 'wss',
      },
      // In dev inside Docker, Nginx proxies /api — no proxy needed here.
      // When running Vite directly outside Docker, proxy to local API.
      proxy: env.VITE_API_TARGET
        ? {
            '/api': {
              target: env.VITE_API_TARGET,
              changeOrigin: true,
            },
          }
        : {},
    },
  };
});
