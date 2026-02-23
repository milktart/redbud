#!/bin/bash
# Database backup script for Bluebonnet Travel Planner
# Usage: ./scripts/db-backup.sh [environment]
# Example: ./scripts/db-backup.sh production

set -e

# Configuration
ENVIRONMENT=${1:-production}
BACKUP_DIR=${BACKUP_DIR:-/backups/bluebonnet}
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-30}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Determine which docker-compose files to use
if [ "$ENVIRONMENT" == "production" ]; then
    COMPOSE_FILES="-f docker-compose.yml -f docker-compose.production.yml"
    DB_NAME="prod_travel_planner"
    BACKUP_FILE="$BACKUP_DIR/prod_travel_planner_$TIMESTAMP.sql"
else
    COMPOSE_FILES=""
    DB_NAME="dev_travel_planner"
    BACKUP_FILE="$BACKUP_DIR/dev_travel_planner_$TIMESTAMP.sql"
fi

echo -e "${YELLOW}=== Bluebonnet Database Backup ===${NC}"
echo "Environment: $ENVIRONMENT"
echo "Database: $DB_NAME"
echo "Timestamp: $TIMESTAMP"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Check if database container is running
echo -e "\n${YELLOW}Checking database container...${NC}"
if ! docker compose $COMPOSE_FILES ps postgres | grep -q "Up"; then
    echo -e "${RED}ERROR: Database container is not running${NC}"
    exit 1
fi

echo -e "${GREEN}Database container is running${NC}"

# Create backup
echo -e "\n${YELLOW}Creating backup...${NC}"
if docker compose $COMPOSE_FILES exec -T postgres pg_dump -U postgres "$DB_NAME" > "$BACKUP_FILE"; then
    echo -e "${GREEN}Backup created: $BACKUP_FILE${NC}"
else
    echo -e "${RED}ERROR: Backup failed${NC}"
    exit 1
fi

# Get backup size
BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "Backup size: $BACKUP_SIZE"

# Compress backup
echo -e "\n${YELLOW}Compressing backup...${NC}"
if gzip "$BACKUP_FILE"; then
    echo -e "${GREEN}Backup compressed: ${BACKUP_FILE}.gz${NC}"
    COMPRESSED_SIZE=$(du -h "${BACKUP_FILE}.gz" | cut -f1)
    echo "Compressed size: $COMPRESSED_SIZE"
else
    echo -e "${RED}ERROR: Compression failed${NC}"
    exit 1
fi

# Clean up old backups
echo -e "\n${YELLOW}Cleaning up old backups (keeping last $RETENTION_DAYS days)...${NC}"
DELETED_COUNT=$(find "$BACKUP_DIR" -name "*.sql.gz" -type f -mtime "+$RETENTION_DAYS" -delete -print | wc -l)
echo "Deleted $DELETED_COUNT old backup(s)"

# List recent backups
echo -e "\n${YELLOW}Recent backups:${NC}"
ls -lht "$BACKUP_DIR"/*.sql.gz 2>/dev/null | head -5 || echo "No backups found"

echo -e "\n${GREEN}=== Backup Complete ===${NC}"
echo "Backup location: ${BACKUP_FILE}.gz"
