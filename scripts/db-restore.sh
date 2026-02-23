#!/bin/bash
# Database restore script for Bluebonnet Travel Planner
# Usage: ./scripts/db-restore.sh [backup-file] [environment]
# Example: ./scripts/db-restore.sh /backups/bluebonnet/prod_travel_planner_20251119_120000.sql.gz production

set -e

# Configuration
BACKUP_FILE=$1
ENVIRONMENT=${2:-production}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if backup file provided
if [ -z "$BACKUP_FILE" ]; then
    echo -e "${RED}ERROR: No backup file specified${NC}"
    echo "Usage: ./scripts/db-restore.sh [backup-file] [environment]"
    echo "Example: ./scripts/db-restore.sh /backups/bluebonnet/prod_travel_planner_20251119_120000.sql.gz production"
    exit 1
fi

# Check if backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
    echo -e "${RED}ERROR: Backup file not found: $BACKUP_FILE${NC}"
    exit 1
fi

# Determine which docker-compose files to use
if [ "$ENVIRONMENT" == "production" ]; then
    COMPOSE_FILES="-f docker-compose.yml -f docker-compose.production.yml"
    DB_NAME="prod_travel_planner"
else
    COMPOSE_FILES=""
    DB_NAME="dev_travel_planner"
fi

echo -e "${YELLOW}=== Bluebonnet Database Restore ===${NC}"
echo "Environment: $ENVIRONMENT"
echo "Database: $DB_NAME"
echo "Backup file: $BACKUP_FILE"

# Warning prompt for production
if [ "$ENVIRONMENT" == "production" ]; then
    echo -e "\n${RED}WARNING: You are about to restore the PRODUCTION database!${NC}"
    echo -e "${RED}This will OVERWRITE all current data in the database.${NC}"
    read -p "Are you sure you want to continue? (type 'yes' to confirm): " -r
    if [ "$REPLY" != "yes" ]; then
        echo "Restore cancelled."
        exit 0
    fi
fi

# Check if database container is running
echo -e "\n${YELLOW}Checking database container...${NC}"
if ! docker compose $COMPOSE_FILES ps postgres | grep -q "Up"; then
    echo -e "${RED}ERROR: Database container is not running${NC}"
    exit 1
fi

echo -e "${GREEN}Database container is running${NC}"

# Stop application container to prevent connections
echo -e "\n${YELLOW}Stopping application container...${NC}"
docker compose $COMPOSE_FILES stop app
echo -e "${GREEN}Application stopped${NC}"

# Decompress if needed
RESTORE_FILE="$BACKUP_FILE"
if [[ "$BACKUP_FILE" == *.gz ]]; then
    echo -e "\n${YELLOW}Decompressing backup...${NC}"
    RESTORE_FILE="${BACKUP_FILE%.gz}"
    gunzip -c "$BACKUP_FILE" > "$RESTORE_FILE"
    TEMP_FILE=true
fi

# Drop existing connections
echo -e "\n${YELLOW}Dropping existing database connections...${NC}"
docker compose $COMPOSE_FILES exec -T postgres psql -U postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();" || true

# Drop and recreate database
echo -e "\n${YELLOW}Recreating database...${NC}"
docker compose $COMPOSE_FILES exec -T postgres psql -U postgres -c "DROP DATABASE IF EXISTS $DB_NAME;"
docker compose $COMPOSE_FILES exec -T postgres psql -U postgres -c "CREATE DATABASE $DB_NAME;"

# Restore database
echo -e "\n${YELLOW}Restoring database from backup...${NC}"
if docker compose $COMPOSE_FILES exec -T postgres psql -U postgres "$DB_NAME" < "$RESTORE_FILE"; then
    echo -e "${GREEN}Database restored successfully${NC}"
else
    echo -e "${RED}ERROR: Database restore failed${NC}"
    # Clean up temp file
    if [ "$TEMP_FILE" == "true" ]; then
        rm -f "$RESTORE_FILE"
    fi
    exit 1
fi

# Clean up temp file
if [ "$TEMP_FILE" == "true" ]; then
    rm -f "$RESTORE_FILE"
fi

# Restart application
echo -e "\n${YELLOW}Starting application container...${NC}"
docker compose $COMPOSE_FILES start app

# Wait for application to be healthy
echo -e "\n${YELLOW}Waiting for application to be healthy...${NC}"
sleep 5

# Check health endpoint (if available)
if [ "$ENVIRONMENT" == "production" ]; then
    HEALTH_URL="http://localhost:3500/health"
else
    HEALTH_URL="http://localhost:3501/health"
fi

if command -v curl &> /dev/null; then
    if curl -f "$HEALTH_URL" &> /dev/null; then
        echo -e "${GREEN}Application is healthy${NC}"
    else
        echo -e "${YELLOW}Warning: Health check failed (application may still be starting)${NC}"
    fi
fi

echo -e "\n${GREEN}=== Restore Complete ===${NC}"
echo "Database: $DB_NAME"
echo "Restored from: $BACKUP_FILE"
