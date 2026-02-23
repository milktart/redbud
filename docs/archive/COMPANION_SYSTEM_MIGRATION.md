# Companion System Migration Guide

## Overview

This document describes the migration from the old 5-model companion system to the new simplified 2-model attendee system. The new system reduces complexity by ~60% while maintaining all functionality and adding better permission granularity.

## Architecture Changes

### Old System (REMOVED)
- **5 Models**: TravelCompanion, TripCompanion, ItemCompanion, CompanionPermission, CompanionRelationship
- **4 Services**: CompanionCascadeManager, itemCompanionService, companionService, companionPermissionService
- **Complex cascading logic**: Automatic propagation with inheritance flags
- **Scattered permission checks**: Multiple files and utilities

### New System (IMPLEMENTED)
- **2 Models**: Companion, Attendee
- **2 Services**: CompanionService, AttendeeService
- **Explicit cascading**: Clear methods in AttendeeService
- **Centralized permissions**: All checks in services with middleware

## Data Model

### Companion (User-to-User Relationships)
```javascript
{
  id: UUID,
  userId: UUID,              // Owner of this companion list
  companionUserId: UUID,     // The companion user
  permissionLevel: ENUM,     // 'none', 'view', 'manage_all'
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP
}
```

**Key Features:**
- Bidirectional: Adding User A to User B creates TWO records
- Global permissions: Apply to ALL trips/items of the owner
- Reciprocal default: Companion gets 'none' permission by default

### Attendee (Trip/Item Specific Access)
```javascript
{
  id: UUID,
  userId: UUID,              // The attendee
  itemType: ENUM,            // 'trip', 'flight', 'hotel', etc.
  itemId: UUID,              // Polymorphic reference
  permissionLevel: ENUM,     // 'view', 'manage'
  addedBy: UUID,             // Who added this attendee
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP
}
```

**Key Features:**
- Local permissions: Specific to individual trip/item
- Polymorphic: Works with all item types
- Explicit cascade: AttendeeService has cascade methods

### CreatedBy Field (All Trip/Item Models)
```javascript
{
  createdBy: UUID,           // Immutable - tracks original creator
  // ... other fields
}
```

**Key Features:**
- Immutable audit trail
- Only creator can delete
- Separate from ownership (userId)

## Permission System

### Permission Levels

**Companion Permissions (Global):**
- `none`: No permissions (default for reciprocal)
- `view`: Can view all owner's trips/items
- `manage_all`: Can view and edit all owner's trips/items (cannot delete)

**Attendee Permissions (Local):**
- `view`: Can view this specific trip/item
- `manage`: Can view and edit this specific trip/item (cannot delete)

### Permission Logic

**View Permission:**
```
canView = (userId === createdBy) 
       || (isAttendee) 
       || (hasCompanionViewPermission)
```

**Manage Permission:**
```
canManage = (userId === createdBy) 
         || (isAttendee with 'manage') 
         || (hasCompanionManageAllPermission)
```

**Delete Permission:**
```
canDelete = (userId === createdBy)  // ONLY creator can delete
```

## API Endpoints

### Companion Management

```
POST   /api/v1/companions
  Body: { email, permissionLevel }
  Creates bidirectional companion relationship

GET    /api/v1/companions
  Returns companions I added

GET    /api/v1/companions/received
  Returns companions who added me

PUT    /api/v1/companions/:companionUserId
  Body: { permissionLevel }
  Updates permission level

DELETE /api/v1/companions/:companionUserId
  Removes companion (both sides)
```

### Attendee Management

```
POST   /api/v1/attendees
  Body: { email, itemType, itemId, permissionLevel }
  Adds user as attendee (cascades if itemType='trip')

GET    /api/v1/attendees?itemType=trip&itemId=xxx
  Returns all attendees for trip/item

PUT    /api/v1/attendees/:attendeeId
  Body: { permissionLevel }
  Updates permission level

DELETE /api/v1/attendees/:attendeeId
  Removes attendee (cascades if trip, validates not creator)
```

## Deployment Steps

### 1. Prerequisites
```bash
# Ensure dependencies are installed
npm install

# Ensure environment variables are set
# NODE_ENV, DB_USER, DB_PASSWORD, DB_NAME, DB_HOST, etc.
```

### 2. Database Migration
```bash
# Sync database to create new tables and drop old ones
npm run db:sync
```

**This will:**
- Create `companions` table
- Create `attendees` table
- Add `createdBy` column to: trips, flights, hotels, events, transportation, car_rentals
- Drop old tables: travel_companions, trip_companions, item_companions, companion_permissions, companion_relationships
- Backfill `createdBy` with `userId` for existing records

### 3. Verification
```bash
# Check tables were created
psql -U $DB_USER -d $DB_NAME -c "\dt"

# Verify companions table
psql -U $DB_USER -d $DB_NAME -c "\d companions"

# Verify attendees table
psql -U $DB_USER -d $DB_NAME -c "\d attendees"

# Check createdBy columns exist
psql -U $DB_USER -d $DB_NAME -c "\d trips" | grep createdBy
psql -U $DB_USER -d $DB_NAME -c "\d flights" | grep createdBy
```

### 4. Test Basic Operations
```bash
# Run tests (when implemented)
npm test

# Start server
npm start

# Test companion creation via API
curl -X POST http://localhost:3000/api/v1/companions \
  -H "Content-Type: application/json" \
  -d '{"email": "companion@example.com", "permissionLevel": "view"}'

# Test trip creation (should auto-create attendee)
curl -X POST http://localhost:3000/api/v1/trips \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Trip", "departureDate": "2026-03-01", "returnDate": "2026-03-07"}'
```

## Migration Scenarios

### Scenario 1: Fresh Installation
- No migration needed
- Database sync will create tables from scratch
- All new records will have proper createdBy and attendee relationships

### Scenario 2: Existing Data (No Companion Data)
- Database sync will add createdBy columns
- Backfill: createdBy = userId for all existing records
- No attendee records need migration (old system is removed)
- Users can start adding companions/attendees via new API

### Scenario 3: Existing Data (With Old Companion Data)
**Old companion data will be LOST during migration.**

If you need to preserve old companion relationships:

1. Before running `npm run db:sync`, export old companion data:
```sql
-- Export old TravelCompanions
COPY (SELECT * FROM travel_companions) TO '/tmp/old_companions.csv' CSV HEADER;

-- Export old TripCompanions
COPY (SELECT * FROM trip_companions) TO '/tmp/old_trip_companions.csv' CSV HEADER;

-- Export old ItemCompanions
COPY (SELECT * FROM item_companions) TO '/tmp/old_item_companions.csv' CSV HEADER;

-- Export old CompanionPermissions
COPY (SELECT * FROM companion_permissions) TO '/tmp/old_permissions.csv' CSV HEADER;
```

2. After sync, create a migration script to:
   - Map old TravelCompanion → new Companion (with 'view' permission)
   - Map old CompanionPermission grants → update permission levels
   - Map old TripCompanion/ItemCompanion → new Attendee records
   - Ensure bidirectional Companion relationships

3. Example migration script structure:
```javascript
// scripts/migrate-companion-data.js
const { Companion, Attendee, User } = require('../models');

async function migrateCompanions() {
  // Read old data from CSV exports
  // Create bidirectional Companion records
  // Create Attendee records for trips/items
  // Set appropriate permission levels
}
```

## Testing Checklist

### Unit Tests (services/AttendeeService.test.js)
- [ ] Add companion by email
- [ ] Create bidirectional relationship
- [ ] Update companion permission
- [ ] Remove companion (both sides)
- [ ] Add attendee to trip
- [ ] Add attendee to item
- [ ] Cascade add to trip items
- [ ] Cascade remove from trip items
- [ ] Inherit trip attendees on item creation
- [ ] Check view permission (creator, attendee, companion)
- [ ] Check manage permission (creator, attendee, companion)
- [ ] Check delete permission (creator only)

### Integration Tests
- [ ] Create trip → verify creator is attendee
- [ ] Add item to trip → verify trip attendees inherited
- [ ] Add companion to trip → verify added to all items
- [ ] Remove attendee from trip → verify removed from all items
- [ ] Try to delete as non-creator → verify forbidden
- [ ] Try to edit as view-only attendee → verify forbidden
- [ ] Edit as manage attendee → verify success
- [ ] Companion with manage_all can edit items → verify success
- [ ] Remove companion → verify both sides deleted

### Manual Testing
1. **Add companion with view permission**
   - Verify bidirectional relationship created
   - Verify reciprocal has 'none' permission
   - Verify can view owner's trips

2. **Grant manage_all permission**
   - Verify companion can edit owner's trips/items
   - Verify companion cannot delete owner's trips/items

3. **Create trip**
   - Verify creator is added as attendee with manage permission

4. **Add item to trip**
   - Verify all trip attendees are inherited

5. **Add attendee to trip**
   - Verify attendee added to all existing items in trip

6. **Remove attendee from trip**
   - Verify attendee removed from all items in trip

7. **Try to delete as non-creator**
   - Verify deletion is blocked with proper error message

8. **Try to edit as view-only attendee**
   - Verify edit is blocked with proper error message

9. **Remove self as attendee**
   - Verify attendee can remove themselves
   - Verify cannot remove if creator

## Rollback Plan

If issues are encountered after deployment:

### 1. Database Rollback (if possible)
```bash
# Restore from backup taken before migration
pg_restore -U $DB_USER -d $DB_NAME /path/to/backup.sql
```

### 2. Code Rollback
```bash
# Checkout previous git commit
git checkout <previous-commit-hash>

# Reinstall dependencies
npm install

# Restart server
npm start
```

### 3. Partial Rollback (Keep new system, restore old data)
If you need to keep the new system but restore old companion data:
- The old models/services are removed
- You would need to manually migrate old data to new system
- Not recommended - better to fix forward

## Troubleshooting

### Issue: "Cannot find module 'CompanionService'"
**Solution:** Service moved to `services/CompanionService.js`. Update imports.

### Issue: "Column 'createdBy' does not exist"
**Solution:** Run `npm run db:sync` to add columns.

### Issue: "Table 'companions' does not exist"
**Solution:** Run `npm run db:sync` to create tables.

### Issue: "Permission denied on update/delete"
**Solution:** Check that user has appropriate attendee or companion permission level.

### Issue: "Only the creator can delete this item"
**Solution:** Working as intended - only creator can delete. If needed, transfer ownership first.

### Issue: "User is already an attendee"
**Solution:** User already has access. Update permission level instead of adding again.

## Performance Considerations

### Database Indexes
The new system includes indexes on:
- `companions(userId, companionUserId)` - Unique, primary lookup
- `companions(companionUserId)` - Reverse lookups
- `companions(userId, permissionLevel)` - Permission filtering
- `attendees(userId, itemType, itemId)` - Unique, primary lookup
- `attendees(itemType, itemId)` - Item attendee lists
- `attendees(userId)` - User's attended items
- `attendees(addedBy)` - Audit trail

### Cascade Operations
- Adding attendee to trip cascades to all items: O(n) where n = number of items
- Removing attendee from trip cascades to all items: O(n) where n = number of items
- Use bulk operations when possible
- Consider background jobs for large trips (50+ items)

### Caching
The system works with existing Redis caching:
- Trip lists are cached
- Trip details are cached
- Cache invalidation on attendee changes

## Security Considerations

### Permission Bypass Prevention
- All permission checks in service layer (not just middleware)
- Delete restricted to creator only (no exceptions)
- Bidirectional companion relationships prevent asymmetric access
- Unique constraints prevent duplicate attendees

### Audit Trail
- `createdBy` field is immutable (set once on creation)
- `addedBy` field tracks who added each attendee
- Timestamps track when relationships were created

### Input Validation
- Email validation before finding users
- Permission level validation (valid ENUMs only)
- Item type validation (valid ENUMs only)
- Cannot add self as companion

## Support

For issues or questions:
- Review this guide
- Check application logs: `logger.error()` entries
- Review service layer logic in `services/CompanionService.js` and `services/AttendeeService.js`
- Check database constraints and indexes

## Summary

The new companion system provides:
- ✅ **Simplicity**: 2 models instead of 5
- ✅ **Clarity**: Explicit permissions (global vs local)
- ✅ **Security**: Creator-only delete, proper permission checks
- ✅ **Auditability**: Immutable creator field, addedBy tracking
- ✅ **Flexibility**: Companion (global) + Attendee (local) permissions
- ✅ **Maintainability**: Centralized logic, no cascade manager

The migration removes ~60% of the complexity while maintaining all functionality and improving permission granularity.
