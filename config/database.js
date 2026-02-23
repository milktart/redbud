require('dotenv').config();

const DB_HOST_DEFAULT = 'localhost';
const DB_PORT_DEFAULT = 5432;
const POOL_ACQUIRE_TIMEOUT = parseInt(process.env.POOL_ACQUIRE_TIMEOUT, 10) || 30000;
const POOL_IDLE_TIMEOUT = parseInt(process.env.POOL_IDLE_TIMEOUT, 10) || 10000;

// Shared pool config per environment size
const devPool = { max: 5, min: 0, acquire: POOL_ACQUIRE_TIMEOUT, idle: POOL_IDLE_TIMEOUT };
const prodPool = { max: 10, min: 2, acquire: POOL_ACQUIRE_TIMEOUT, idle: POOL_IDLE_TIMEOUT };

// Shared dialect options
const dialectOptions = {
  timezone: 'Etc/GMT-0',
};

// Add SSL only when DB host is not a local/Docker hostname
const prodDialectOptions = {
  ...dialectOptions,
  ...(process.env.DB_HOST &&
  process.env.DB_HOST !== 'postgres' &&
  process.env.DB_HOST !== 'localhost'
    ? { ssl: { require: true, rejectUnauthorized: false } }
    : {}),
};

module.exports = {
  development: {
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'development_travel_planner',
    host: process.env.DB_HOST || DB_HOST_DEFAULT,
    port: process.env.DB_PORT || DB_PORT_DEFAULT,
    dialect: 'postgres',
    logging: false,
    timezone: '+00:00',
    dialectOptions,
    pool: devPool,
  },

  test: {
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'test_travel_planner',
    host: process.env.DB_HOST || DB_HOST_DEFAULT,
    port: process.env.DB_PORT || DB_PORT_DEFAULT,
    dialect: 'postgres',
    logging: false,
    timezone: '+00:00',
    dialectOptions,
    pool: devPool,
  },

  production: {
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || DB_PORT_DEFAULT,
    dialect: 'postgres',
    logging: false,
    timezone: '+00:00',
    dialectOptions: prodDialectOptions,
    pool: prodPool,
  },
};
