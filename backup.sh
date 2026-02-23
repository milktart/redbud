#!/bin/bash

# Complete PostgreSQL + Redis backup for full restore capability

# Source .env to get environment variables
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

BACKUP_DIR="backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DB_NAME="${NODE_ENV}_${DB_NAME}"

# Create backups directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

echo "Starting complete backup at $(date)..."

# 1. PostgreSQL FULL backup (includes all DBs, roles, permissions)
echo "  → Backing up PostgreSQL (full system)..."
docker compose exec -T postgres pg_dumpall -U postgres | gzip > "$BACKUP_DIR/postgres_full_${TIMESTAMP}.sql.gz"

# 2. PostgreSQL data-only backup (for faster restores if schema exists)
echo "  → Backing up PostgreSQL data..."
docker compose exec -T postgres pg_dump -U postgres -a "$DB_NAME" | gzip > "$BACKUP_DIR/postgres_data_${TIMESTAMP}.sql.gz"

# 3. Redis backup (sessions, cache)
echo "  → Backing up Redis..."
docker compose exec -T redis redis-cli --rdb /data/dump.rdb
docker compose cp redis:/data/dump.rdb "$BACKUP_DIR/redis_${TIMESTAMP}.rdb"

# 4. Create manifest file (what was backed up)
cat > "$BACKUP_DIR/backup_manifest_${TIMESTAMP}.txt" << EOF
=== Complete Backup Manifest ===
Created: $(date)
Database: $DB_NAME

Contents:
1. postgres_full_${TIMESTAMP}.sql.gz
   - All databases
   - All roles/users
   - All permissions
   - Full system state
   - Restore: pg_restore or psql < file

2. postgres_data_${TIMESTAMP}.sql.gz
   - Data only (no schema)
   - Useful for quick data restore if schema exists
   - Restore: psql < file (schema must exist)

3. redis_${TIMESTAMP}.rdb
   - Redis dump
   - Includes sessions and cache
   - Restore: Copy to redis data directory

Instructions for full restore:
1. Stop app: docker compose down
2. Restore DB: docker compose exec -T postgres psql -U postgres < postgres_full_${TIMESTAMP}.sql
3. Restore Redis: Copy redis_${TIMESTAMP}.rdb to redis data volume
4. Start: docker compose up
EOF

echo "✅ Backup complete!"
echo "  Backups location: $BACKUP_DIR/"
ls -lh "$BACKUP_DIR"/backup_manifest_${TIMESTAMP}.txt
