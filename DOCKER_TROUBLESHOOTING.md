# Docker Troubleshooting Guide

## PostgreSQL "Sleeping" Error - Fixed

### What Was The Issue?
When rebuilding containers, the application would try to connect to PostgreSQL before it was fully ready to accept connections, resulting in "Postgres is unavailable - sleeping" messages.

### What We Fixed

1. **Created Robust Database Wait Script** (`scripts/wait-for-db.js`)
   - Better error messages showing connection attempts
   - Proper timeout handling (30 attempts × 2 seconds = 60 seconds max wait)
   - Exits with proper error codes

2. **Improved Entrypoint Script** (`scripts/docker-entrypoint.sh`)
   - Uses the dedicated wait-for-db.js script
   - Better error handling for database sync failures
   - Added stability delay before seeding operations

3. **Existing Health Checks** (Already in place)
   - PostgreSQL health check in docker-compose.yml
   - App container waits for healthy status via `depends_on` condition

## How To Use

### Rebuild Containers (Clean Build)

```bash
# Stop and remove all containers, networks, and volumes
docker-compose down -v

# Rebuild and start
docker-compose up --build
```

### View Logs

```bash
# View all logs
docker-compose logs -f

# View only app logs
docker-compose logs -f app

# View only database logs
docker-compose logs -f postgres
```

### Common Commands

```bash
# Start containers
docker-compose up -d

# Stop containers
docker-compose down

# Restart just the app container
docker-compose restart app

# Check container status
docker-compose ps

# Execute commands in running container
docker-compose exec app npm run db:migrate
docker-compose exec app npm test

# Access database directly
docker-compose exec postgres psql -U postgres -d UI_travel_planner
```

### Troubleshooting Steps

#### 1. Container Won't Start
```bash
# Check logs
docker-compose logs app

# Common issues:
# - Database connection timeout → Wait longer or check DB_HOST in .env
# - Missing environment variables → Check .env file
# - Permission errors → Check file ownership in volumes
```

#### 2. Database Connection Issues
```bash
# Verify PostgreSQL is running
docker-compose ps postgres

# Check PostgreSQL logs
docker-compose logs postgres

# Test connection manually
docker-compose exec postgres pg_isready -U postgres

# Connect to database
docker-compose exec postgres psql -U postgres -d UI_travel_planner
```

#### 3. Port Conflicts
```bash
# Check if ports are in use
lsof -i :3002  # App port
lsof -i :5442  # PostgreSQL port
lsof -i :6389  # Redis port

# Update ports in .env if needed
```

#### 4. Volume Permission Issues
```bash
# Fix node_modules permissions in container
docker-compose exec app chown -R node:node /app/node_modules

# Or rebuild with clean volumes
docker-compose down -v
docker-compose up --build
```

#### 5. Stale Data Issues
```bash
# Remove volumes and rebuild
docker-compose down -v
docker-compose up --build

# This will:
# - Delete all database data
# - Delete all Redis data
# - Rebuild containers from scratch
```

## Configuration

### Environment Variables (.env)
```env
NODE_ENV=UI                    # Environment (development, production, UI, test)
PORT=3002                      # Internal app port
APP_PORT=3510                  # External app port (host:container)
DB_PORT=5442                   # PostgreSQL port
REDIS_PORT=6389                # Redis port

DB_HOST=postgres               # Use 'postgres' in Docker, 'localhost' locally
DB_NAME=travel_planner         # Base database name (prefixed with NODE_ENV)
DB_USER=postgres
DB_PASSWORD=postgres

REDIS_ENABLED=false            # Enable/disable Redis
REDIS_HOST=redis               # Use 'redis' in Docker, 'localhost' locally

SESSION_SECRET=your-secret-key # CHANGE IN PRODUCTION!
LOG_LEVEL=DEBUG                # error, warn, info, debug
```

### Database Naming
Database name follows pattern: `{NODE_ENV}_{DB_NAME}`
- UI environment → `UI_travel_planner`
- development → `dev_travel_planner`
- production → `production_travel_planner`

## Performance Tips

1. **Use Docker BuildKit** for faster builds:
   ```bash
   DOCKER_BUILDKIT=1 docker-compose build
   ```

2. **Layer Caching**: package.json changes trigger npm install, but code changes don't

3. **Multi-stage Builds**: Dockerfile uses separate stages for dev/prod to minimize image size

4. **Health Checks**: Ensure services are truly ready before dependent services start

## When To Rebuild

### Full Rebuild Required:
- Dockerfile changes
- package.json dependency changes
- Major configuration changes

### Restart Only:
- Code changes (auto-reload in dev mode via volume mount)
- .env changes
- Minor config changes

### No Action Needed:
- Code changes in development (nodemon auto-reloads)

## Accessing the UI

Once containers are running:
- **Landing Page**: http://localhost:3510
- **Login**: http://localhost:3510/login.html
- **Dashboard**: http://localhost:3510/dashboard.html (requires login)
- **Health Check**: http://localhost:3510/health
- **API**: http://localhost:3510/api/v1/*

## Additional Resources

- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [PostgreSQL Docker Image](https://hub.docker.com/_/postgres)
- [Node.js Docker Best Practices](https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md)
