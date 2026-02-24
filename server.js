require('dotenv').config();
const express = require('express');
const session = require('express-session');
const { RedisStore } = require('connect-redis');
const passport = require('passport');
const compression = require('compression');
const cors = require('cors');
const db = require('./models');
const logger = require('./utils/logger');
const redis = require('./utils/redis');
const { MS_PER_DAY } = require('./utils/constants');

// Validate required environment variables
const requiredEnvVars = ['SESSION_SECRET'];
const missingVars = requiredEnvVars.filter((varName) => !process.env[varName]);

if (missingVars.length > 0) {
  logger.error('Missing required environment variables', { missingVars });
  logger.error(`Please set the following variables in your .env file: ${missingVars.join(', ')}`);
  process.exit(1);
}

const app = express();

// Trust proxy — required when behind Nginx reverse proxy
app.set('trust proxy', 1);

// ============================================================================
// Request parsing
// ============================================================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(compression());

// ============================================================================
// CORS
// Only needed if the API is accessed directly (e.g. during local dev outside
// Docker). In production, Nginx handles same-origin so CORS isn't required.
// ============================================================================
app.use(
  cors({
    origin(origin, callback) {
      // Allow requests with no origin (Postman, server-to-server, etc.)
      if (!origin) return callback(null, true);
      callback(null, origin);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'X-Requested-With'],
  })
);

// ============================================================================
// Authentication
// ============================================================================
require('./config/passport')(passport);

// ============================================================================
// Request logging
// ============================================================================
app.use(require('./middleware/requestLogger'));

// ============================================================================
// Health check
// ============================================================================
app.get('/health', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    version: require('./package.json').version,
  };

  try {
    await db.sequelize.authenticate();
    health.database = 'connected';
  } catch (error) {
    health.database = 'disconnected';
    health.status = 'degraded';
    logger.error('Health check: database connection failed', { error: error.message });
  }

  try {
    const client = redis.getClient();
    if (client && redis.isAvailable()) {
      await client.ping();
      health.redis = 'connected';
    } else {
      health.redis = 'disabled';
    }
  } catch (error) {
    health.redis = 'disconnected';
    health.status = 'degraded';
    logger.error('Health check: Redis connection failed', { error: error.message });
  }

  res.status(health.status === 'ok' ? 200 : 503).json(health);
});

// ============================================================================
// API routes
// ============================================================================
app.use('/api', require('./routes/api'));

// ============================================================================
// Error handling
// ============================================================================
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

app.use(notFoundHandler);
app.use(errorHandler);

// ============================================================================
// Start
// ============================================================================
const PORT = process.env.PORT || 3000;

async function initializeApp() {
  try {
    await redis.initRedis();

    // Session store — set up after Redis is connected so RedisStore is available
    const redisClient = redis.getClient();
    let sessionStore;
    if (redisClient && redis.isAvailable()) {
      sessionStore = new RedisStore({ client: redisClient, prefix: 'sess:' });
      logger.info('Using Redis for session storage');
    } else {
      logger.info('Using memory store for sessions (Redis disabled or unavailable)');
    }

    app.use(
      session({
        store: sessionStore,
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
          maxAge: parseInt(process.env.SESSION_MAX_AGE, 10) || MS_PER_DAY,
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'strict' : false,
        },
      })
    );
    app.use(passport.initialize());
    app.use(passport.session());

    await db.sequelize.authenticate();
    logger.info('Database connection established');

    const server = app.listen(PORT, () => {
      logger.info(`Redbud API running on port ${PORT}`, {
        environment: process.env.NODE_ENV,
        redis: redis.isAvailable() ? 'enabled' : 'disabled',
      });
    });

    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down gracefully');
      await redis.disconnect();
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    });
  } catch (err) {
    logger.error('Application initialization failed', { error: err.message, stack: err.stack });
    process.exit(1);
  }
}

initializeApp();
