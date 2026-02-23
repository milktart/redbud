#!/bin/sh
set -e

# Wait for postgres to be ready
node /app/scripts/wait-for-db.js

# Sync database schema
if ! npm run db:sync; then
  echo "Database sync failed, but continuing..."
fi

# Wait a moment for database to stabilize
sleep 1

# Seed airport data if not already present
DB_NEEDS_AIRPORTS=$(node -e "
const { Airport } = require('./models');
Airport.count()
  .then(count => { console.log(count === 0 ? 'true' : 'false'); process.exit(0); })
  .catch(() => { console.log('true'); process.exit(0); });
" 2>/dev/null || echo "true")

if [ "$DB_NEEDS_AIRPORTS" = "true" ]; then
  npm run db:seed-airports
fi

exec node --unhandled-rejections=strict /app/server.js
