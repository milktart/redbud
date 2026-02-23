/**
 * Development Server with SvelteKit Hot-Reload
 *
 * This runs BOTH:
 * 1. Express backend on port 3000 (handles /api, /auth, /trips, etc.)
 * 2. SvelteKit dev server on port 3001 (handles UI with Vite hot-reload)
 *
 * In production, this is bypassed and Express serves pre-built SvelteKit assets.
 */

require('dotenv').config();
const { spawn } = require('child_process');
const path = require('path');

const logger = require('../utils/logger');

async function startDevServer() {
  try {
    const frontendDir = path.join(__dirname, '../frontend');
    const PORT = process.env.PORT || '3001';
    const EXPRESS_PORT = 3000; // Internal port for Express backend

    logger.info('🔥 Starting development environment with hot-reload', {
      frontend_port: PORT,
      backend_port: EXPRESS_PORT,
    });

    // Start Express backend on port 3000
    logger.info('Starting Express backend on port 3000...');
    const expressServer = spawn('node', ['server.js'], {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
      shell: true,
      env: {
        ...process.env,
        PORT: EXPRESS_PORT,
        NODE_ENV: 'development',
      },
    });

    expressServer.on('error', (err) => {
      logger.error('Failed to start Express backend', {
        error: err.message,
      });
      process.exit(1);
    });

    // Wait a bit for Express to start, then start SvelteKit
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Start SvelteKit dev server on port 3001
    logger.info('Starting SvelteKit dev server on port 3001...');
    const svelteKitServer = spawn(
      'npm',
      ['run', 'dev', '--', '--host', '0.0.0.0', '--port', PORT],
      {
        cwd: frontendDir,
        stdio: 'inherit',
        shell: true,
      }
    );

    svelteKitServer.on('error', (err) => {
      logger.error('Failed to start SvelteKit dev server', {
        error: err.message,
      });
      expressServer.kill('SIGTERM');
      process.exit(1);
    });

    svelteKitServer.on('exit', (code, signal) => {
      logger.info('SvelteKit dev server exited', { code, signal });
      expressServer.kill('SIGTERM');
      process.exit(code || 1);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, shutting down servers');
      svelteKitServer.kill('SIGTERM');
      expressServer.kill('SIGTERM');
    });
  } catch (error) {
    logger.error('Failed to initialize development server', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
}

// Start the development server
startDevServer();
