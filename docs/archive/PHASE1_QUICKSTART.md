# Phase 1 Quick Start Guide

**For developers working on the Travel Planner API**

This guide shows you how to immediately use the new Phase 1 infrastructure in your code.

---

## TL;DR - Copy These Patterns

### 1. Creating a New Route

```javascript
// routes/api/v1/YOUR_RESOURCE.js
const express = require('express');
const { ensureAuthenticated } = require('../../../middleware/auth');
const { checkTripAccess, checkItemOwnership } = require('../../../middleware/authorization');
const yourController = require('../../../controllers/yourController');

const router = express.Router();
router.use(ensureAuthenticated);

// Trip-level access
router.get('/trips/:tripId', checkTripAccess('view'), yourController.getItemsInTrip);

// Item-level access
router.get('/:id', checkItemOwnership('YourModel', 'item'), yourController.getItem);
router.put('/:id', checkItemOwnership('YourModel', 'item'), yourController.updateItem);
router.delete('/:id', checkItemOwnership('YourModel', 'item'), yourController.deleteItem);

module.exports = router;
```

### 2. Creating a New Controller

```javascript
// controllers/yourController.js
const YourService = require('../services/YourService');
const ItemPresentationService = require('../services/presentation/ItemPresentationService');
const apiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');

const yourService = new YourService();
const presentationService = new ItemPresentationService();

exports.getItem = async (req, res) => {
  try {
    const item = await yourService.findById(req.params.id);
    const enriched = presentationService.enrichItem(item, req.user.id);
    return apiResponse.success(res, enriched);
  } catch (error) {
    logger.error('GET_ITEM_ERROR', { error: error.message });
    return apiResponse.internalError(res, 'Failed to retrieve item', error);
  }
};
```

### 3. Using Permission Service in Business Logic

```javascript
// services/YourService.js
const PermissionService = require('./PermissionService');

class YourService {
  constructor() {
    this.permissionService = new PermissionService();
  }

  async updateItem(itemId, updateData, userId) {
    const item = await this.findById(itemId);

    // Verify access (throws if denied)
    await this.permissionService.verifyItemAccess(item, userId, 'edit');

    return this.update(itemId, updateData);
  }
}
```

### 4. Using Cache Keys

```javascript
const CacheKeyService = require('../services/CacheKeyService');
const cacheKeyService = new CacheKeyService();

// In your service
async getTrips(userId, filter) {
  const cacheKey = cacheKeyService.getUserTripsKey(userId, filter);

  // Check cache
  const cached = await cacheService.get(cacheKey);
  if (cached) return cached;

  // Fetch data
  const trips = await this.fetchTrips(userId, filter);

  // Cache it
  await cacheService.set(cacheKey, trips);

  return trips;
}
```

---

## What's Available

### Authorization Middleware

**File:** `middleware/authorization.js`

**What it does:** Verifies user owns a trip or item, returns 403 if not.

**When to use:**
- Any route that accesses a trip or travel item
- Replaces inline `Trip.findOne({ where: { userId } })` checks

**Functions:**

```javascript
checkTripAccess(permission)         // Check trip ownership
checkItemOwnership(model, type)     // Check item ownership
checkItemTripAccess(model, type)    // Check item + its trip
```

**Example:**
```javascript
const { checkTripAccess } = require('../../../middleware/authorization');

router.get('/trips/:tripId/hotels',
  checkTripAccess('view'),  // Verifies ownership, attaches to req.trip
  hotelController.getTripHotels
);
```

---

### Permission Service

**File:** `services/PermissionService.js`

**What it does:** Checks if a user can view/edit/delete an item or trip.

**When to use:**
- Service layer permission checks
- Conditional logic based on permissions
- Getting permission flags for UI

**Key Methods:**

```javascript
canViewItem(item, userId)           // → boolean
canEditItem(item, userId)           // → boolean
canDeleteItem(item, userId)         // → boolean

getItemPermissions(item, userId)    // → { canView, canEdit, canDelete, isOwner, isShared }
verifyItemAccess(item, userId, 'edit')  // → throws if no access

// Same for trips:
canViewTrip(trip, userId)
getTripPermissions(trip, userId)
verifyTripAccess(trip, userId, 'edit')
```

**Example:**
```javascript
const PermissionService = require('../services/PermissionService');
const permissionService = new PermissionService();

// In service method
async deleteItem(itemId, userId) {
  const item = await this.findById(itemId);

  // Throws if user can't delete
  await permissionService.verifyItemAccess(item, userId, 'delete');

  return this.model.destroy({ where: { id: itemId } });
}
```

---

### Cache Key Service

**File:** `services/CacheKeyService.js`

**What it does:** Generates consistent cache keys for all entities.

**When to use:**
- Any time you cache data
- Prevents key collision bugs
- Easy bulk invalidation

**Key Methods:**

```javascript
// User-related
getUserTripsKey(userId, filter, page)
getUserProfileKey(userId)
getUserCachePattern(userId)  // For bulk invalidation

// Trip-related
getTripKey(tripId)
getTripItemsKey(tripId, itemType)
getTripCachePattern(tripId)

// Item-related
getHotelKey(hotelId)
getFlightKey(flightId)
getEventKey(eventId)
// etc.
```

**Example:**
```javascript
const CacheKeyService = require('../services/CacheKeyService');
const cacheKeyService = new CacheKeyService();

// Cache trip data
const key = cacheKeyService.getTripKey(tripId);
await cacheService.set(key, tripData, 300);

// Invalidate all user caches
const pattern = cacheKeyService.getUserCachePattern(userId);
await cacheService.deletePattern(pattern);
```

---

### Item Presentation Service

**File:** `services/presentation/ItemPresentationService.js`

**What it does:** Adds UI properties to items/trips (permission flags, etc.).

**When to use:**
- Controller layer (before sending response)
- Web UI endpoints (NOT mobile API - they get raw data)
- Any time you need `canEdit`, `canDelete` flags

**Key Methods:**

```javascript
enrichItem(item, userId)            // → item with permission flags
enrichItems(items, userId)          // → array with permission flags
enrichTrip(trip, userId)            // → trip with permission flags
enrichEvent(event, userId)          // → event with permissions + isAllDay
```

**Example:**
```javascript
const ItemPresentationService = require('../services/presentation/ItemPresentationService');
const presentationService = new ItemPresentationService();

// In controller
exports.getHotels = async (req, res) => {
  const hotels = await hotelService.getTripHotels(req.params.tripId);

  // Add canEdit, canDelete, isOwner, isShared flags
  const enriched = presentationService.enrichItems(hotels, req.user.id);

  return apiResponse.success(res, enriched);
};
```

**What it adds to each item:**
```javascript
{
  // ... original item fields ...
  canEdit: true,      // User can edit this item
  canDelete: true,    // User can delete this item
  canView: true,      // User can view this item
  isOwner: true,      // User owns this item
  isShared: false     // Item is shared with user (not owner)
}
```

**For events, also adds:**
```javascript
{
  isAllDay: true  // Event has no specific start/end times
}
```

---

## Common Recipes

### Recipe 1: Add a New GET Route

**Goal:** Get all hotels in a trip

1. **Add route:**
   ```javascript
   router.get('/trips/:tripId',
     checkTripAccess('view'),
     hotelController.getTripHotels
   );
   ```

2. **Add controller method:**
   ```javascript
   exports.getTripHotels = async (req, res) => {
     try {
       const hotels = await hotelService.getTripHotels(req.params.tripId);
       const enriched = presentationService.enrichItems(hotels, req.user.id);
       return apiResponse.success(res, enriched);
     } catch (error) {
       return apiResponse.internalError(res, 'Failed to get hotels', error);
     }
   };
   ```

3. **Add service method (if needed):**
   ```javascript
   async getTripHotels(tripId) {
     return this.findAll({ tripId }, { order: [['checkInDate', 'ASC']] });
   }
   ```

**Done!** ✅

---

### Recipe 2: Add a New PUT Route

**Goal:** Update a hotel

1. **Add route:**
   ```javascript
   router.put('/:id',
     checkItemOwnership('Hotel', 'hotel'),
     hotelController.updateHotel
   );
   ```

2. **Add controller method:**
   ```javascript
   exports.updateHotel = async (req, res) => {
     try {
       const hotel = await hotelService.update(req.params.id, req.body);
       const enriched = presentationService.enrichItem(hotel, req.user.id);
       return apiResponse.success(res, enriched, 'Hotel updated');
     } catch (error) {
       return apiResponse.internalError(res, 'Failed to update hotel', error);
     }
   };
   ```

3. **Service method (already exists in BaseService):**
   ```javascript
   // No need to add - BaseService.update() already exists
   ```

**Done!** ✅

---

### Recipe 3: Add Permission Check in Service

**Goal:** Verify user can delete an item before deleting

1. **In service:**
   ```javascript
   const PermissionService = require('./PermissionService');

   class HotelService extends TravelItemService {
     constructor() {
       super();
       this.permissionService = new PermissionService();
     }

     async deleteHotel(hotelId, userId) {
       // Get hotel
       const hotel = await this.findById(hotelId);

       // Verify permission (throws 403 if denied)
       await this.permissionService.verifyItemAccess(hotel, userId, 'delete');

       // Delete
       return this.delete(hotelId);
     }
   }
   ```

**Done!** ✅

---

### Recipe 4: Add Caching to a Service Method

**Goal:** Cache trip data for 5 minutes

1. **In service:**
   ```javascript
   const CacheKeyService = require('./CacheKeyService');
   const cacheService = require('./cacheService');

   class TripService {
     constructor() {
       this.cacheKeyService = new CacheKeyService();
     }

     async getTrip(tripId) {
       // Generate cache key
       const cacheKey = this.cacheKeyService.getTripKey(tripId);

       // Check cache
       const cached = await cacheService.get(cacheKey);
       if (cached) return cached;

       // Fetch from DB
       const trip = await Trip.findByPk(tripId);

       // Cache for 5 minutes
       await cacheService.set(cacheKey, trip, 300);

       return trip;
     }
   }
   ```

2. **Invalidate cache on update:**
   ```javascript
   async updateTrip(tripId, updateData) {
     const trip = await this.update(tripId, updateData);

     // Invalidate cache
     const cacheKey = this.cacheKeyService.getTripKey(tripId);
     await cacheService.delete(cacheKey);

     return trip;
   }
   ```

**Done!** ✅

---

## Decision Tree: Which Service to Use?

```
Do you need to check permissions?
├─ YES → Use PermissionService
│   ├─ Need boolean (true/false)? → canViewItem(), canEditItem(), canDeleteItem()
│   ├─ Need all flags at once? → getItemPermissions()
│   └─ Need to throw error if denied? → verifyItemAccess()
│
└─ NO → Continue

Do you need to add UI properties to items?
├─ YES → Use ItemPresentationService
│   ├─ Single item? → enrichItem()
│   ├─ Multiple items? → enrichItems()
│   ├─ Trip? → enrichTrip()
│   └─ Event? → enrichEvent() (adds isAllDay flag)
│
└─ NO → Continue

Do you need to cache data?
├─ YES → Use CacheKeyService
│   ├─ User data? → getUserTripsKey(), getUserProfileKey()
│   ├─ Trip data? → getTripKey(), getTripItemsKey()
│   ├─ Item data? → getHotelKey(), getFlightKey()
│   └─ Bulk invalidation? → getUserCachePattern(), getTripCachePattern()
│
└─ NO → Continue

Do you need to verify ownership in a route?
├─ YES → Use Authorization Middleware
│   ├─ Trip ownership? → checkTripAccess('view')
│   ├─ Item ownership? → checkItemOwnership('Hotel', 'hotel')
│   └─ Item + trip? → checkItemTripAccess('Hotel', 'hotel')
│
└─ NO → You probably don't need Phase 1 services for this task
```

---

## Gotchas & Tips

### ✅ DO

- **Use middleware for all routes** that access trips/items
- **Use presentation service in controllers** for web UI endpoints
- **Use permission service in services** for business logic checks
- **Use cache key service** for ALL caching operations
- **Test your code** - All Phase 1 services are fully tested

### ❌ DON'T

- **Don't** use direct model queries in routes (use services)
- **Don't** duplicate authorization logic (use middleware)
- **Don't** hardcode cache keys (use CacheKeyService)
- **Don't** add UI properties in services (use ItemPresentationService)
- **Don't** use presentation service for mobile API (raw data only)

---

## Testing Your Code

### Example: Testing a Controller

```javascript
describe('HotelController', () => {
  it('should return enriched hotels for a trip', async () => {
    const mockHotels = [{ id: 'hotel-1', userId: 'user-123' }];

    // Mock service
    hotelService.getTripHotels = jest.fn().mockResolvedValue(mockHotels);

    // Mock request
    const req = { params: { tripId: 'trip-1' }, user: { id: 'user-123' } };
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    await hotelController.getTripHotels(req, res);

    // Verify service called
    expect(hotelService.getTripHotels).toHaveBeenCalledWith('trip-1');

    // Verify response enriched
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.arrayContaining([
          expect.objectContaining({
            id: 'hotel-1',
            canEdit: true,  // Added by presentation service
            canDelete: true,
            isOwner: true
          })
        ])
      })
    );
  });
});
```

### Example: Testing Permission Service

```javascript
describe('PermissionService', () => {
  const permissionService = new PermissionService();

  it('should allow owner to edit item', () => {
    const item = { userId: 'user-123' };
    expect(permissionService.canEditItem(item, 'user-123')).toBe(true);
  });

  it('should throw 403 when non-owner tries to edit', async () => {
    const item = { userId: 'user-123' };

    await expect(
      permissionService.verifyItemAccess(item, 'user-456', 'edit')
    ).rejects.toThrow('Access denied');
  });
});
```

---

## Migration Checklist

When refactoring an existing route:

- [ ] Create controller if doesn't exist
- [ ] Move route logic to controller method
- [ ] Use `checkTripAccess` or `checkItemOwnership` middleware
- [ ] Use service for data operations (no direct model access)
- [ ] Use `ItemPresentationService` for enrichment
- [ ] Use `CacheKeyService` for cache keys
- [ ] Remove inline authorization checks
- [ ] Write/update tests
- [ ] Verify existing tests still pass

---

## Questions?

**Documentation:**
- Full details: `docs/MVCS_REFACTORING_PHASE1_COMPLETE.md`
- Examples: `docs/PHASE1_USAGE_EXAMPLES.md`
- Progress: `docs/MVCS_REFACTORING_SUMMARY.md`

**Code Examples:**
- See existing tests in `tests/unit/services/`
- See usage examples in `docs/PHASE1_USAGE_EXAMPLES.md`

**Need Help?**
- Check the decision tree above
- Review the common recipes
- Look at the test files for examples

---

**Last Updated:** 2026-02-15
**Phase:** 1 Complete ✅
