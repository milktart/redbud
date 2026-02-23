#!/bin/bash
# Deployment script for Bluebonnet Travel Planner
# Usage: ./scripts/deploy.sh [environment]
# Example: ./scripts/deploy.sh production

set -e

# Configuration
ENVIRONMENT=${1:-production}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Determine which docker-compose files to use
if [ "$ENVIRONMENT" == "production" ]; then
    COMPOSE_FILES="-f docker-compose.yml -f docker-compose.production.yml"
    BRANCH="main"
    HEALTH_URL="http://localhost:3500/health"
else
    COMPOSE_FILES=""
    BRANCH=${2:-"main"}  # Allow custom branch for dev
    HEALTH_URL="http://localhost:3501/health"
fi

echo -e "${BLUE}╔════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Bluebonnet Travel Planner Deployment     ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════╝${NC}"
echo ""
echo "Environment: $ENVIRONMENT"
echo "Branch: $BRANCH"
echo ""

# Pre-deployment checks
echo -e "${YELLOW}=== Pre-Deployment Checks ===${NC}"

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}ERROR: package.json not found. Are you in the project root?${NC}"
    exit 1
fi

# Check current git branch
CURRENT_BRANCH=$(git branch --show-current)
echo "Current branch: $CURRENT_BRANCH"

if [ "$ENVIRONMENT" == "production" ] && [ "$CURRENT_BRANCH" != "main" ]; then
    echo -e "${RED}ERROR: Production deployments must be from 'main' branch${NC}"
    exit 1
fi

# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    echo -e "${YELLOW}WARNING: You have uncommitted changes${NC}"
    git status --short
    read -p "Continue anyway? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Backup database (production only)
if [ "$ENVIRONMENT" == "production" ]; then
    echo -e "\n${YELLOW}=== Creating Database Backup ===${NC}"
    ./scripts/db-backup.sh production
fi

# Pull latest code
echo -e "\n${YELLOW}=== Pulling Latest Code ===${NC}"
git fetch origin
git pull origin "$BRANCH"

# Show recent commits
echo -e "\n${BLUE}Recent commits:${NC}"
git log --oneline -3

# Check for migrations
echo -e "\n${YELLOW}=== Checking Database Migrations ===${NC}"
if docker compose $COMPOSE_FILES ps postgres | grep -q "Up"; then
    echo "Checking migration status..."
    docker compose $COMPOSE_FILES exec app npm run db:migrate:status || true
else
    echo "Database container not running, will check after startup"
fi

# Build new images
echo -e "\n${YELLOW}=== Building Docker Images ===${NC}"
docker compose $COMPOSE_FILES build --no-cache

# Stop current containers
echo -e "\n${YELLOW}=== Stopping Current Containers ===${NC}"
docker compose $COMPOSE_FILES down

# Start new containers
echo -e "\n${YELLOW}=== Starting New Containers ===${NC}"
docker compose $COMPOSE_FILES up -d

# Wait for services to be healthy
echo -e "\n${YELLOW}=== Waiting for Services ===${NC}"
echo "Waiting 10 seconds for services to start..."
sleep 10

# Run migrations
echo -e "\n${YELLOW}=== Running Database Migrations ===${NC}"
docker compose $COMPOSE_FILES exec app npm run db:migrate

# Health check
echo -e "\n${YELLOW}=== Health Check ===${NC}"
if command -v curl &> /dev/null; then
    for i in {1..5}; do
        if curl -f "$HEALTH_URL" 2>/dev/null; then
            echo -e "${GREEN}✓ Health check passed${NC}"
            break
        else
            if [ $i -eq 5 ]; then
                echo -e "${RED}✗ Health check failed after 5 attempts${NC}"
                echo -e "${YELLOW}Check logs: docker compose $COMPOSE_FILES logs app${NC}"
                exit 1
            fi
            echo "Attempt $i/5 failed, retrying in 3 seconds..."
            sleep 3
        fi
    done
else
    echo -e "${YELLOW}curl not available, skipping automated health check${NC}"
    echo "Manually check: $HEALTH_URL"
fi

# Show container status
echo -e "\n${YELLOW}=== Container Status ===${NC}"
docker compose $COMPOSE_FILES ps

# Show recent logs
echo -e "\n${YELLOW}=== Recent Logs ===${NC}"
docker compose $COMPOSE_FILES logs app --tail=20

# Summary
echo -e "\n${GREEN}╔════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Deployment Complete!                      ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════╝${NC}"
echo ""
echo "Environment: $ENVIRONMENT"
echo "Health URL: $HEALTH_URL"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "1. Verify application functionality"
echo "2. Monitor logs: docker compose $COMPOSE_FILES logs -f app"
echo "3. Check health: curl $HEALTH_URL"
echo ""

if [ "$ENVIRONMENT" == "production" ]; then
    echo -e "${YELLOW}Important:${NC}"
    echo "- Database backup created before deployment"
    echo "- Monitor application for any issues"
    echo "- Rollback if needed: git checkout [previous-commit] && ./scripts/deploy.sh production"
    echo ""
fi
