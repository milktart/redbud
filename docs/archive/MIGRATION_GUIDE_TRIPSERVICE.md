# Migration Guide: tripService.js → New Service Trio

**Purpose:** Guide for migrating from deprecated `tripService.js` to the new Phase 4 service trio.

**Status:** tripService.js is now deprecated and will be removed in a future release.

---

## Overview

The monolithic `tripService.js` (1,152 lines) has been split into three focused services:

1. **TripDataService** - Pure data access
2. **TripBusinessService** - Business logic & orchestration
3. **TripPresentationService** - UI enrichment

---

## Quick Reference

### Import Changes

**Before:**
```javascript
const tripService = require('../services/tripService');
```

**After:**
```javascript
const TripBusinessService = require('../services/business/TripBusinessService');
const TripPresentationService = require('../services/presentation/TripPresentationService');

const tripBusinessService = new TripBusinessService();
const tripPresentationService = new TripPresentationService();
```

**Or for data-only access:**
```javascript
const TripDataService = require('../services/TripDataService');
const tripDataService = new TripDataService();
```

---

## Method Migration Map

### getUserTrips()

**Before:**
```javascript
const result = await tripService.getUserTrips(userId, { filter: 'upcoming', page: 1, limit: 20 });
// Returns enriched data with canEdit, canDelete flags
```

**After (Web UI - with presentation):**
```javascript
// 1. Get raw data from business service
const result = await tripBusinessService.getUserTrips(userId, {
  filter: 'upcoming',
  page: 1,
  limit: 20
});

// 2. Enrich for UI
const enriched = tripPresentationService.enrichUserTripsResponse(result, userId, {
  page: 1,
  limit: 20,
  totalCount: result.totalCount,
  filter: 'upcoming'
});

// enriched now has canEdit, canDelete, isAllDay, pagination
```

**After (Mobile API - no presentation):**
```javascript
// Just get raw data, skip presentation
const result = await tripBusinessService.getUserTrips(userId, {
  filter: 'upcoming',
  page: 1,
  limit: 20
});

// Return raw data without UI flags
return result;
```

---

### getTripWithDetails()

**Before:**
```javascript
const trip = await tripService.getTripWithDetails(tripId, userId);
// Returns trip with canEdit, canDelete flags
```

**After (with presentation):**
```javascript
// 1. Get raw trip data
const trip = await tripBusinessService.getTripWithDetails(tripId, userId);

if (!trip) {
  return null; // Not found or no access
}

// 2. Enrich for UI
const enriched = tripPresentationService.enrichTrip(trip, userId);

// enriched has canEdit, canDelete, isOwner, isShared flags
```

**After (without presentation):**
```javascript
// Just get raw trip
const trip = await tripBusinessService.getTripWithDetails(tripId, userId);
return trip; // Raw data
```

---

### getTripStatistics()

**Before:**
```javascript
const stats = await tripService.getTripStatistics(userId);
```

**After:**
```javascript
// No change needed - business service method is identical
const stats = await tripBusinessService.getTripStatistics(userId);
```

---

### searchTrips()

**Before:**
```javascript
const trips = await tripService.searchTrips(userId, query, limit);
// Returns trips without enrichment
```

**After (with presentation):**
```javascript
// 1. Search trips
const trips = await tripBusinessService.searchTrips(userId, query, limit);

// 2. Enrich for UI
const enriched = tripPresentationService.enrichTrips(trips, userId);
```

**After (without presentation):**
```javascript
// Just search
const trips = await tripBusinessService.searchTrips(userId, query, limit);
```

---

### createTrip()

**Before:**
```javascript
const trip = await tripService.createTrip(data, userId);
```

**After (with presentation):**
```javascript
// 1. Create trip
const trip = await tripBusinessService.createTrip(data, userId);

// 2. Enrich for UI
const enriched = tripPresentationService.enrichTrip(trip, userId);
```

**After (without presentation):**
```javascript
const trip = await tripBusinessService.createTrip(data, userId);
```

---

### updateTrip()

**Before:**
```javascript
const trip = await tripService.updateTrip(tripId, data, userId);
```

**After (with presentation):**
```javascript
// 1. Update trip
const trip = await tripBusinessService.updateTrip(tripId, data, userId);

if (!trip) {
  return null; // Not found or no access
}

// 2. Enrich for UI
const enriched = tripPresentationService.enrichTrip(trip, userId);
```

**After (without presentation):**
```javascript
const trip = await tripBusinessService.updateTrip(tripId, data, userId);
```

---

### deleteTrip()

**Before:**
```javascript
const success = await tripService.deleteTrip(tripId, userId);
```

**After:**
```javascript
// No change needed
const success = await tripBusinessService.deleteTrip(tripId, userId);
```

---

## Controller Pattern

### Before (Old Pattern)

```javascript
// routes/api/v1/trips.js
const tripService = require('../../../services/tripService');

router.get('/', async (req, res) => {
  try {
    const { filter = 'upcoming', page = 1, limit = 20 } = req.query;
    const result = await tripService.getUserTrips(req.user.id, { filter, page, limit });

    // ... inline logic for deduplication, pagination ...

    return apiResponse.success(res, { trips, standalone: result.standalone }, message);
  } catch (error) {
    return apiResponse.internalError(res, 'Failed to retrieve trips', error);
  }
});
```

### After (New Pattern)

```javascript
// routes/api/v1/trips.js
const tripController = require('../../../controllers/tripController');

router.get('/', tripController.getUserTrips);
```

```javascript
// controllers/tripController.js
const TripBusinessService = require('../services/business/TripBusinessService');
const TripPresentationService = require('../services/presentation/TripPresentationService');

const tripBusinessService = new TripBusinessService();
const tripPresentationService = new TripPresentationService();

exports.getUserTrips = async (req, res) => {
  try {
    const { filter = 'upcoming', page = 1, limit = 20 } = req.query;

    // 1. Get raw data
    const result = await tripBusinessService.getUserTrips(req.user.id, {
      filter,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10)
    });

    // 2. Enrich for UI
    const enriched = tripPresentationService.enrichUserTripsResponse(result, req.user.id, {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      totalCount: result.totalCount,
      filter
    });

    // ... deduplication logic ...

    return apiResponse.success(res, { trips, standalone: enriched.standalone }, message);
  } catch (error) {
    logger.error('GET_USER_TRIPS_ERROR', { userId: req.user.id, error: error.message });
    return apiResponse.internalError(res, 'Failed to retrieve trips', error);
  }
};
```

---

## Testing Migration

### Before (Old Pattern)

```javascript
const tripService = require('../../services/tripService');
jest.mock('../../services/tripService');

test('should get trips', async () => {
  tripService.getUserTrips = jest.fn().mockResolvedValue(mockResult);

  const result = await tripService.getUserTrips(userId, options);

  expect(result).toEqual(mockResult);
  expect(tripService.getUserTrips).toHaveBeenCalledWith(userId, options);
});
```

### After (New Pattern)

```javascript
jest.mock('../../services/business/TripBusinessService');
jest.mock('../../services/presentation/TripPresentationService');

const TripBusinessService = require('../../services/business/TripBusinessService');
const TripPresentationService = require('../../services/presentation/TripPresentationService');

test('should get trips', async () => {
  const mockBusinessService = {
    getUserTrips: jest.fn().mockResolvedValue(mockRawData)
  };

  const mockPresentationService = {
    enrichUserTripsResponse: jest.fn().mockReturnValue(mockEnrichedData)
  };

  TripBusinessService.mockImplementation(() => mockBusinessService);
  TripPresentationService.mockImplementation(() => mockPresentationService);

  // Test business service
  const result = await mockBusinessService.getUserTrips(userId, options);
  expect(result).toEqual(mockRawData);

  // Test presentation service
  const enriched = mockPresentationService.enrichUserTripsResponse(result, userId);
  expect(enriched).toEqual(mockEnrichedData);
});
```

---

## Data-Only Access

For background jobs, CLI tools, or admin operations that don't need UI enrichment:

```javascript
const TripDataService = require('../services/TripDataService');
const tripDataService = new TripDataService();

// Get raw trips without business logic
const trips = await tripDataService.getUserOwnedTrips(userId, {
  dateFilter: { departureDate: { [Op.gte]: today } },
  orderDirection: 'ASC',
  includeItems: true
});

// Raw data, no permissions, no presentation
```

---

## Cache Warming (Special Case)

### Before

```javascript
// services/cacheService.js
async function warmUpUserCache(userId, services) {
  if (services.tripService) {
    const trips = await services.tripService.getUserTrips(userId, { filter: 'upcoming' });
    await cacheUserTrips(userId, 'upcoming', 1, trips);
  }
}
```

### After

```javascript
// services/cacheService.js
async function warmUpUserCache(userId, services) {
  // Prefer new service, fallback to old for compatibility
  if (services.tripBusinessService) {
    const trips = await services.tripBusinessService.getUserTrips(userId, { filter: 'upcoming' });
    await cacheUserTrips(userId, 'upcoming', 1, trips);
  } else if (services.tripService) {
    // Fallback to deprecated service for backward compatibility
    const trips = await services.tripService.getUserTrips(userId, { filter: 'upcoming' });
    await cacheUserTrips(userId, 'upcoming', 1, trips);
  }
}
```

---

## Migration Checklist

### For Each File Using tripService.js:

- [ ] Identify which methods are being used
- [ ] Determine if UI enrichment is needed (web UI) or not (mobile API, background jobs)
- [ ] Import TripBusinessService (always needed)
- [ ] Import TripPresentationService (if UI enrichment needed)
- [ ] Replace method calls with business service
- [ ] Add presentation enrichment if needed
- [ ] Update tests to mock new services
- [ ] Test thoroughly
- [ ] Remove old tripService import

---

## Benefits of Migration

### Before Migration
- Monolithic service (1,152 lines)
- Mixed concerns (data, business, presentation)
- Hard to test independently
- No option to skip presentation
- Tight coupling

### After Migration
- Three focused services (<600 lines each)
- Clear separation of concerns
- Independently testable
- Optional presentation layer
- Loose coupling
- Reusable across contexts (web, mobile, CLI, GraphQL)

---

## Timeline

**Current Status:**
- ✅ New services created and tested
- ✅ tripController.js migrated
- ✅ routes/api/v1/trips.js migrated
- ✅ cacheService.js migrated (with fallback)
- ✅ tests/integration/trips.test.js migrated
- ✅ tripService.js marked as deprecated

**Remaining:**
- None! All active usage has been migrated.
- tripService.js kept for backward compatibility only

**Future:**
- Monitor for any new usage (deprecation warning will log)
- Remove tripService.js after confirming zero usage

---

## Getting Help

**Documentation:**
- `docs/MVCS_REFACTORING_PHASE4_COMPLETE.md` - Phase 4 details
- `docs/MVCS_ARCHITECTURE_GUIDE.md` - Architecture patterns
- `docs/MVCS_REFACTORING_FINAL_SUMMARY.md` - Complete summary

**Examples:**
- Look at `controllers/tripController.js` - Migrated controller
- Look at `tests/integration/trips.test.js` - Migrated tests

**Questions:**
- Review the migration examples in this guide
- Check existing migrated code
- Refer to Phase 4 documentation

---

**Migration Status:** ✅ All active usage migrated!

**Next Steps:** Monitor for deprecation warnings, confirm zero usage, remove tripService.js in future release.
