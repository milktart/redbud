# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Documentation

All markdown documentation files (READMEs, migration guides, architecture summaries, etc.) must be placed in the `docs/` directory — **never in the repository root or scattered throughout the codebase**. The only exception is this `CLAUDE.md` file itself.

- `docs/` — API docs, architecture guides, general references
- `docs/archive/` — Historical migration notes, refactoring summaries, completed phase docs
- `docs/frontend/` — Frontend-specific documentation

## Project Overview

This is a travel planning REST API built with Node.js, Express, PostgreSQL, and Redis. The application manages trips, travel items (flights, hotels, events, transportation, car rentals), travel companions, and companion permissions with a sophisticated cascading system.

## API Structure (Simplified 2026)

The API has been ruthlessly simplified from 83 endpoints down to ~40 endpoints. Key changes:

### Authentication API (`/api/v1/auth`)
- `POST /api/v1/auth/login` - User login
- `POST /api/v1/auth/register` - User registration
- `GET /api/v1/auth/logout` - User logout
- `GET /api/v1/auth/verify-session` - Session verification

### Unified Item API (`/api/v1/item`)
**All travel item types (flights, hotels, transportation, events, car_rentals) use a single unified API:**

- `POST /api/v1/item` - Create any item type (requires `itemType` in body)
- `GET /api/v1/item` - List items (optional filters: `?type=flight&tripId=abc-123`)
- `GET /api/v1/item/:id` - Get single item (any type)
- `PUT /api/v1/item/:id` - Update item (requires `itemType` in body)
- `DELETE /api/v1/item/:id` - Delete item (soft delete)

**Example - Create a flight:**
```json
POST /api/v1/item
{
  "itemType": "flight",
  "tripId": "uuid-here",
  "flightNumber": "AA100",
  "origin": "JFK",
  "destination": "LAX",
  "departureDate": "2024-01-01",
  "departureTime": "10:00",
  "arrivalDate": "2024-01-01",
  "arrivalTime": "14:00"
}
```

**Example - List all hotels in a trip:**
```
GET /api/v1/item?type=hotel&tripId=abc-123
```

### Trips API (`/api/v1/trips`)
- `GET /api/v1/trips` - List all trips
- `GET /api/v1/trips/:id` - Get trip details
- `POST /api/v1/trips` - Create trip
- `PUT /api/v1/trips/:id` - Update trip
- `DELETE /api/v1/trips/:id` - Delete trip

### Other APIs
- **Companions** (`/api/v1/companions`) - 4 endpoints
- **Attendees** (`/api/v1/attendees`) - 4 endpoints
- **Vouchers** (`/api/v1/vouchers`) - 5 endpoints
- **Users** (`/api/v1/users`) - 6 endpoints
- **Airports** (`/api/v1/airports`) - 3 endpoints
- **Geocoding** (`/api/v1/geocode`) - 1 endpoint

### Removed/Deprecated
- ❌ Individual item endpoints (`/flights`, `/hotels`, `/transportation`, `/events`, `/car-rentals`) - **use `/item` instead**
- ❌ ItemTrip junction table - items now directly linked to trips via `tripId` foreign key
- ❌ `GET /trips/stats` - unused endpoint removed
- ❌ `GET /trips/search` - unused endpoint removed
- ❌ `GET /companions/received` - unused endpoint removed
- ❌ `POST /vouchers/trips/:tripId` - use `POST /vouchers` with `tripId` in body instead

## Common Commands

### Development
```bash
# Start development server with tsx watch
npm run dev

# Start with nodemon
npm run dev:node

# Start with Docker
npm run dev:docker
```

### Database Operations
```bash
# Run migrations
npm run db:migrate

# Undo last migration
npm run db:migrate:undo

# Check migration status
npm run db:migrate:status

# Sync database schema (use cautiously)
npm run db:sync

# Seed airports data
npm run db:seed-airports

# Seed companion data
npm run db:seed-companion-data

# Verify migrations
npm run db:verify-migration
npm run db:verify-companion-migration

# Backfill transportation coordinates
npm run db:backfill-transportation-coords
```

### Cache Management
```bash
# Clear Redis cache
npm run cache:clear
```

### Testing
```bash
# Run all tests
npm test

# Run tests in watch mode
npm test:watch

# Run with coverage
npm test:coverage

# Run unit tests only
npm test:unit

# Run integration tests only
npm test:integration

# Verbose output
npm test:verbose
```

### Code Quality
```bash
# Lint code
npm run lint

# Lint and fix issues
npm run lint:fix

# Format code
npm run format

# Check formatting
npm run format:check

# Type check
npm run type-check
```

### Docker
```bash
# Start all services (postgres, redis, app)
docker-compose up -d

# Stop all services
docker-compose down

# View logs
docker-compose logs -f app
```

## Architecture

### Service Layer Pattern

The codebase uses a three-tier service layer architecture:

1. **BaseService** (`services/BaseService.js`) - Provides common CRUD operations for all models
2. **TravelItemService** (`services/TravelItemService.js`) - Extends BaseService with travel item-specific logic (datetime parsing, geocoding, timezone handling, companion management)
3. **Specific Item Services** (e.g., `FlightService`, `HotelService`) - Extend TravelItemService with item-specific business logic

All services follow this inheritance pattern:
```
BaseService → TravelItemService → FlightService/HotelService/etc.
```

### Unified Item Controller

The `itemController.js` provides a single API endpoint for all travel item types. It:
- Routes to appropriate service based on `itemType` parameter
- Calls type-specific `prepare*Data()` methods (e.g., `prepareFlightData()`)
- Uses `ItemPresentationService` for enriching responses
- Validates ownership and trip access
- Supports filtering by type and tripId

### Companion & Attendee System

The system has two distinct but related concepts for user collaboration:

#### Companions (Global Relationships)
- **Companion Model** (`models/Companion.js`) - Bidirectional user-to-user relationships
- **CompanionService** (`services/CompanionService.js`) - Manages global companion relationships
- Permission levels: 'none', 'view', 'manage_all'
- Global scope: applies to all trips/items
- Bidirectional: when User A adds User B, creates reciprocal records

#### Attendees (Trip/Item-Specific)
- **Attendee Model** (`models/Attendee.js`) - Associates users with specific trips/items
- **AttendeeService** (`services/AttendeeService.js`) - Manages attendees with cascading support
- Permission levels: 'view', 'manage'
- Item-specific: scoped to individual trips or travel items
- Supports five item types defined in `constants/permissionConstants.js`:
  - trip, flight, hotel, transportation, car_rental, event

#### Key Concepts

1. **Cascading Behavior**: When an attendee is added to a trip, `AttendeeService.cascadeAddToTripItems()` automatically adds them to all existing items in that trip. Similarly, removing an attendee from a trip cascades to all items.

2. **Integration**: AttendeeService integrates with CompanionService for global permission checks.

3. **Controllers**: `controllers/attendeeController.js` handles HTTP requests and delegates to AttendeeService for cascade operations.

### DateTime Handling

The application handles timezones extensively via `DateTimeService` (`services/DateTimeService.js`):

- All datetimes stored in UTC in database
- User-facing datetimes include timezone information
- `DateTimeService.combineDateTimeFields()` - Combines separate date/time fields
- `DateTimeService.convertToUTC()` - Converts local time to UTC
- `DateTimeService.sanitizeTimezones()` - Validates timezone strings

When creating/updating travel items, use `TravelItemService.prepareItemData()` which handles:
1. Combining date/time fields
2. Geocoding locations
3. Timezone conversion to UTC
4. Coordinate extraction

### Authentication & Authorization

- Uses Passport.js with local strategy (`config/passport.js`)
- Session management with Redis (falls back to memory store if Redis unavailable)
- Middleware: `middleware/auth.js` provides `ensureAuthenticated` and `requireAdmin`
- All API routes are versioned under `/api/v1`

### Data Models

Key relationships:
- **User** → **Trip** (one-to-many)
- **Trip** → **Flight/Hotel/Event/Transportation/CarRental** (one-to-many, cascade delete via `tripId` foreign key)
- **User** ↔ **User** (many-to-many via Companion - bidirectional relationships)
- **User** → **Attendee** (one-to-many) - links users to specific trips/items
- **Trip/Flight/Hotel/etc.** → **Attendee** (one-to-many) - users attending specific items

All primary keys are UUIDs. All models use Sequelize with auto-managed timestamps.

### Caching

Redis caching is optional and controlled by `REDIS_ENABLED` environment variable:
- `cacheService` (`services/cacheService.js`) provides get/set/delete/clear operations
- `utils/redis.js` manages connection lifecycle
- Graceful degradation when Redis unavailable

### Constants

Important constants are centralized:
- `constants/permissionConstants.js` - Permission levels, item types (PERMISSION_LEVELS, ITEM_TYPES)
- `utils/constants.js` - General app constants (MS_PER_DAY, etc.)

### Geocoding

The `geocodingService` (`services/geocodingService.js`) handles location geocoding with airport fallback. When a location string matches an airport code/name, it uses the airports database instead of external geocoding API.

### Duplicate Detection

`duplicateDetectionService` (`services/duplicateDetectionService.js`) uses indexed lookups and selective comparison to detect duplicate travel items, preventing users from creating near-identical entries.

## Development Guidelines

### Adding New Travel Item Types

1. Create model in `models/` following existing pattern (Flight.js, Hotel.js, etc.)
2. Add to `models/index.js` associations
3. Create service extending `TravelItemService` in `services/`
4. Add item type to `constants/permissionConstants.js` ITEM_TYPES array
5. Update `AttendeeService.cascadeAddToTripItems()` to include new type in ITEM_MODELS mapping

### Working with Attendees

- Use `AttendeeService.addAttendee()` to add attendees to trips/items
- Use `AttendeeService.cascadeAddToTripItems()` to add an attendee to all items in a trip
- Use `AttendeeService.cascadeRemoveFromTripItems()` to remove an attendee from all items
- Controllers should handle cascade logic (see `controllers/attendeeController.js`)
- Check companion permissions via `CompanionService` for global access control

### Database Migrations

- Migrations are managed by Sequelize CLI
- Migration files should be in chronological order
- Always test migrations with `db:migrate` and `db:migrate:undo`
- Use transactions for multi-step migrations

### Testing

- Unit tests go in `tests/unit/`
- Integration tests go in `tests/integration/`
- Use `tests/testServer.js` for integration test setup
- Use `tests/setup.js` for test configuration

### Environment Configuration

The app supports multiple environments via NODE_ENV:
- `development` - Local development
- `test` - Test environment
- `production` - Production deployment
- `UI` - UI development environment

Database naming: `{NODE_ENV}_{DB_NAME}` (e.g., `dev_travel_planner`)

### Logging

- Use `utils/logger.js` (Winston) for all logging
- Log levels: error, warn, info, debug
- Controlled by `LOG_LEVEL` environment variable
- Logs rotate daily via winston-daily-rotate-file

### API Response Format

Use `utils/apiResponse.js` for consistent API responses:
- `success(res, data, message, statusCode)` - Success responses
- `error(res, message, statusCode, errors)` - Error responses

## Important Notes

- Session secret MUST be changed in production (SESSION_SECRET env var)
- All datetimes are stored in UTC; conversion happens at service layer
- Cascade operations are resource-intensive; use `CompanionCascadeManager` which batches operations
- Redis is optional but recommended for production
- Rate limiting middleware exists but is disabled in development
- The companion permission system has both trip-level and item-level granularity
