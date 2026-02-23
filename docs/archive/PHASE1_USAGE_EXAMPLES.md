# Phase 1 Usage Examples

This document provides concrete examples of using the new Phase 1 infrastructure.

## Example 1: Simple Controller Using New Patterns

### Before (Route with Direct Model Access)

**File:** `routes/api/v1/hotels.js` (lines 45-69)

```javascript
router.get('/trips/:tripId', async (req, res) => {
  try {
    const { tripId } = req.params;
    const { Hotel } = require('../../../models');
    const { Trip } = require('../../../models');

    // PROBLEM: Authorization logic in route
    const trip = await Trip.findOne({
      where: { id: tripId, userId: req.user.id }
    });

    if (!trip) {
      return apiResponse.forbidden(res, 'Access denied');
    }

    // PROBLEM: Direct model query in route
    const hotels = await Hotel.findAll({
      where: { tripId },
      order: [['checkInDate', 'ASC']]
    });

    return apiResponse.success(res, hotels);
  } catch (error) {
    return apiResponse.internalError(res, 'Failed to retrieve hotels', error);
  }
});
```

**Issues:**
- ❌ Authorization logic duplicated in route
- ❌ Direct model access in route
- ❌ Business logic mixed with route handling
- ❌ No controller layer
- ❌ No presentation enrichment

**Line count:** ~25 lines

---

### After (Using Phase 1 Patterns)

#### Step 1: Create Service Method

**File:** `services/HotelService.js` (HotelService already extends TravelItemService)

```javascript
// Add this method to existing HotelService
async getTripHotels(tripId) {
  return this.findAll(
    { tripId },
    { order: [['checkInDate', 'ASC']] }
  );
}
```

**Line count:** ~5 lines

---

#### Step 2: Create Controller

**File:** `controllers/hotelController.js` (NEW FILE)

```javascript
const HotelService = require('../services/HotelService');
const ItemPresentationService = require('../services/presentation/ItemPresentationService');
const apiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');

const hotelService = new HotelService();
const presentationService = new ItemPresentationService();

/**
 * Get all hotels for a trip
 * Route: GET /api/v1/hotels/trips/:tripId
 */
exports.getTripHotels = async (req, res) => {
  try {
    const { tripId } = req.params;

    // Service handles data fetching
    const hotels = await hotelService.getTripHotels(tripId);

    // Presentation service adds UI properties
    const enrichedHotels = presentationService.enrichItems(hotels, req.user.id);

    return apiResponse.success(res, enrichedHotels, `Retrieved ${hotels.length} hotels`);
  } catch (error) {
    logger.error('GET_TRIP_HOTELS_ERROR', { tripId: req.params.tripId, error: error.message });
    return apiResponse.internalError(res, 'Failed to retrieve hotels', error);
  }
};
```

**Line count:** ~12 lines (just the method)

---

#### Step 3: Update Route

**File:** `routes/api/v1/hotels.js`

```javascript
const express = require('express');
const { ensureAuthenticated } = require('../../../middleware/auth');
const { checkTripAccess } = require('../../../middleware/authorization');
const hotelController = require('../../../controllers/hotelController');

const router = express.Router();

router.use(ensureAuthenticated);

// Clean route: middleware → controller
router.get('/trips/:tripId',
  checkTripAccess('view'),  // Middleware handles authorization
  hotelController.getTripHotels  // Controller handles HTTP concerns
);
```

**Line count:** ~5 lines (just the route)

---

### Comparison

| Aspect | Before | After |
|--------|--------|-------|
| **Route complexity** | 25 lines | 5 lines |
| **Authorization** | Inline (duplicated) | Middleware (reusable) |
| **Model access** | Direct in route | Service layer |
| **Separation of concerns** | ❌ Mixed | ✅ Separated |
| **Testability** | Hard to test | Easy to test |
| **Reusability** | Route-specific | Service reusable |
| **Presentation** | None | ItemPresentationService |

**Benefits:**
- ✅ 80% reduction in route complexity (25 → 5 lines)
- ✅ Reusable authorization middleware
- ✅ Testable controller and service
- ✅ Consistent permission flags on response
- ✅ Clear separation of concerns

---

## Example 2: Using PermissionService in Business Logic

### Use Case: Service-Layer Authorization

When a service method needs to verify permissions before performing an operation:

```javascript
// In services/HotelService.js
const PermissionService = require('./PermissionService');

class HotelService extends TravelItemService {
  constructor() {
    super();
    this.permissionService = new PermissionService();
  }

  async updateHotel(hotelId, updateData, userId) {
    // Get hotel
    const hotel = await this.findById(hotelId);

    // Verify user has edit permission (throws if not)
    await this.permissionService.verifyItemAccess(hotel, userId, 'edit');

    // Perform update
    return this.update(hotelId, updateData);
  }

  async deleteHotel(hotelId, userId) {
    // Get hotel
    const hotel = await this.findById(hotelId);

    // Verify user has delete permission
    await this.permissionService.verifyItemAccess(hotel, userId, 'delete');

    // Perform delete
    return this.delete(hotelId);
  }
}
```

**Benefits:**
- Authorization logic in service layer (not route/controller)
- Consistent error messages (403 for access denied, 404 for not found)
- Service methods can be called from anywhere (controllers, background jobs, etc.)

---

## Example 3: Cache Key Service Integration

### Before (Hardcoded Cache Keys)

```javascript
// In cacheService.js or controllers - scattered everywhere
const cacheKey = `user:${userId}:trips:upcoming:${page}`;
const tripKey = `trip:${tripId}:details`;
const hotelKey = `hotel:${hotelId}:details`;

// Inconsistent naming:
const key1 = `user:${userId}:trips:upcoming`;  // Missing page
const key2 = `trip_${tripId}`;  // Different separator
const key3 = `hotel-${hotelId}`;  // Different separator
```

**Problems:**
- ❌ Keys hardcoded in multiple places
- ❌ Inconsistent naming patterns
- ❌ Hard to update key format
- ❌ Risk of key collisions

### After (Using CacheKeyService)

```javascript
const CacheKeyService = require('../services/CacheKeyService');
const cacheKeyService = new CacheKeyService();

// Consistent key generation
const tripsKey = cacheKeyService.getUserTripsKey(userId, 'upcoming', page);
const tripKey = cacheKeyService.getTripKey(tripId);
const hotelKey = cacheKeyService.getHotelKey(hotelId);

// Bulk invalidation patterns
const userPattern = cacheKeyService.getUserCachePattern(userId);
await cacheService.deletePattern(userPattern);  // Invalidates all user caches
```

**Benefits:**
- ✅ Consistent naming across codebase
- ✅ Single source of truth for key formats
- ✅ Easy to update key patterns (change in one place)
- ✅ Testable key generation
- ✅ Bulk invalidation support

---

## Example 4: Item Presentation Service

### Use Case 1: Web UI Endpoint (Needs Enrichment)

```javascript
// Controller for web application
exports.getHotel = async (req, res) => {
  try {
    const hotel = await hotelService.findById(req.params.id);

    // Add UI properties for frontend
    const enriched = presentationService.enrichItem(hotel, req.user.id);
    // enriched = { ...hotel, canEdit: true, canDelete: true, isOwner: true, isShared: false }

    return apiResponse.success(res, enriched);
  } catch (error) {
    return apiResponse.internalError(res, 'Failed to retrieve hotel', error);
  }
};
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "hotel-123",
    "hotelName": "Grand Hotel",
    "checkInDate": "2024-03-15",
    "canEdit": true,
    "canDelete": true,
    "canView": true,
    "isOwner": true,
    "isShared": false
  }
}
```

### Use Case 2: Mobile API Endpoint (Raw Data)

```javascript
// Controller for mobile API (no presentation enrichment)
exports.getHotelRaw = async (req, res) => {
  try {
    const hotel = await hotelService.findById(req.params.id);

    // Return raw data - frontend handles permissions
    return apiResponse.success(res, hotel);
  } catch (error) {
    return apiResponse.internalError(res, 'Failed to retrieve hotel', error);
  }
};
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "hotel-123",
    "hotelName": "Grand Hotel",
    "checkInDate": "2024-03-15"
  }
}
```

**Benefits:**
- Same service layer for both APIs
- Web UI gets enriched data
- Mobile API gets raw data (smaller payload)
- Clear separation: business logic vs. presentation

---

## Example 5: Event Enrichment with isAllDay Flag

### Controller Method

```javascript
exports.getTripEvents = async (req, res) => {
  try {
    const { tripId } = req.params;

    // Get events from service
    const events = await eventService.getTripEvents(tripId);

    // Enrich with permissions AND isAllDay flag
    const enriched = presentationService.enrichEvents(events, req.user.id);

    return apiResponse.success(res, enriched);
  } catch (error) {
    return apiResponse.internalError(res, 'Failed to retrieve events', error);
  }
};
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "event-1",
      "name": "Conference",
      "startDate": "2024-03-15",
      "startTime": null,
      "endTime": null,
      "canEdit": true,
      "canDelete": true,
      "isOwner": true,
      "isAllDay": true
    },
    {
      "id": "event-2",
      "name": "Meeting",
      "startDate": "2024-03-15",
      "startTime": "09:00",
      "endTime": "17:00",
      "canEdit": true,
      "canDelete": true,
      "isOwner": true,
      "isAllDay": false
    }
  ]
}
```

**Frontend can now:**
- Show all-day events differently (no time displayed)
- Display timed events with start/end times
- Show/hide edit/delete buttons based on `canEdit`/`canDelete`

---

## Example 6: Authorization Middleware in Routes

### Multiple Routes Using Same Middleware

```javascript
const { checkTripAccess, checkItemOwnership } = require('../../../middleware/authorization');
const hotelController = require('../../../controllers/hotelController');

// Trip-level access
router.get('/trips/:tripId',
  checkTripAccess('view'),
  hotelController.getTripHotels
);

router.post('/trips/:tripId',
  checkTripAccess('edit'),  // Must be able to edit trip to add hotels
  hotelController.createHotelInTrip
);

// Item-level access
router.get('/:id',
  checkItemOwnership('Hotel', 'hotel'),
  hotelController.getHotel
);

router.put('/:id',
  checkItemOwnership('Hotel', 'hotel'),
  hotelController.updateHotel
);

router.delete('/:id',
  checkItemOwnership('Hotel', 'hotel'),
  hotelController.deleteHotel
);
```

**Benefits:**
- No authorization code in controllers (handled by middleware)
- Consistent 403 responses across all routes
- `req.trip` and `req.item` available in controllers (attached by middleware)
- Easy to update authorization logic (change middleware, not 15 routes)

---

## Testing Examples

### Testing PermissionService

```javascript
describe('PermissionService', () => {
  const permissionService = new PermissionService();

  it('should allow owner to edit item', () => {
    const item = { userId: 'user-123' };
    expect(permissionService.canEditItem(item, 'user-123')).toBe(true);
  });

  it('should deny non-owner to edit item', () => {
    const item = { userId: 'user-123' };
    expect(permissionService.canEditItem(item, 'user-456')).toBe(false);
  });
});
```

### Testing ItemPresentationService

```javascript
describe('ItemPresentationService', () => {
  const presentationService = new ItemPresentationService();

  it('should enrich item with permission flags', () => {
    const item = { id: 'item-1', userId: 'user-123', name: 'Hotel' };
    const enriched = presentationService.enrichItem(item, 'user-123');

    expect(enriched).toMatchObject({
      id: 'item-1',
      name: 'Hotel',
      canEdit: true,
      canDelete: true,
      isOwner: true
    });
  });
});
```

### Testing CacheKeyService

```javascript
describe('CacheKeyService', () => {
  const cacheKeyService = new CacheKeyService();

  it('should generate consistent keys', () => {
    const key1 = cacheKeyService.getUserTripsKey('user-123', 'upcoming', 1);
    const key2 = cacheKeyService.getUserTripsKey('user-123', 'upcoming', 1);
    expect(key1).toBe(key2);
  });

  it('should generate unique keys for different inputs', () => {
    const key1 = cacheKeyService.getUserTripsKey('user-123', 'upcoming', 1);
    const key2 = cacheKeyService.getUserTripsKey('user-123', 'past', 1);
    expect(key1).not.toBe(key2);
  });
});
```

---

## Migration Strategy

### Incremental Adoption

1. **New routes** - Use Phase 1 patterns immediately
2. **High-traffic routes** - Refactor first (biggest impact)
3. **Routes being touched** - Refactor when modifying for other reasons
4. **Low-traffic routes** - Refactor last

### Step-by-Step Migration

**For each route file:**

1. Create controller file (if doesn't exist)
2. Move route logic to controller methods
3. Use authorization middleware in routes
4. Use PermissionService in services
5. Use ItemPresentationService in controllers
6. Use CacheKeyService for caching

**Example timeline:**
- Week 1: hotels.js, flights.js (high traffic)
- Week 2: events.js, transportation.js (medium traffic)
- Week 3: car-rentals.js, vouchers.js (lower traffic)

---

## Common Patterns

### Pattern 1: GET Single Item

```javascript
// Route
router.get('/:id', checkItemOwnership('Hotel', 'hotel'), controller.getHotel);

// Controller
exports.getHotel = async (req, res) => {
  try {
    const hotel = await hotelService.findById(req.params.id);
    const enriched = presentationService.enrichItem(hotel, req.user.id);
    return apiResponse.success(res, enriched);
  } catch (error) {
    return apiResponse.internalError(res, 'Failed to retrieve hotel', error);
  }
};
```

### Pattern 2: GET Collection (Trip Items)

```javascript
// Route
router.get('/trips/:tripId', checkTripAccess('view'), controller.getTripHotels);

// Controller
exports.getTripHotels = async (req, res) => {
  try {
    const hotels = await hotelService.getTripHotels(req.params.tripId);
    const enriched = presentationService.enrichItems(hotels, req.user.id);
    return apiResponse.success(res, enriched);
  } catch (error) {
    return apiResponse.internalError(res, 'Failed to retrieve hotels', error);
  }
};
```

### Pattern 3: POST (Create)

```javascript
// Route
router.post('/trips/:tripId', checkTripAccess('edit'), controller.createHotel);

// Controller
exports.createHotel = async (req, res) => {
  try {
    const hotel = await hotelService.create({
      ...req.body,
      tripId: req.params.tripId,
      userId: req.user.id
    });
    const enriched = presentationService.enrichItem(hotel, req.user.id);
    return apiResponse.created(res, enriched, 'Hotel created');
  } catch (error) {
    return apiResponse.internalError(res, 'Failed to create hotel', error);
  }
};
```

### Pattern 4: PUT (Update)

```javascript
// Route
router.put('/:id', checkItemOwnership('Hotel', 'hotel'), controller.updateHotel);

// Controller
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

### Pattern 5: DELETE

```javascript
// Route
router.delete('/:id', checkItemOwnership('Hotel', 'hotel'), controller.deleteHotel);

// Controller
exports.deleteHotel = async (req, res) => {
  try {
    await hotelService.delete(req.params.id);
    return apiResponse.noContent(res);
  } catch (error) {
    return apiResponse.internalError(res, 'Failed to delete hotel', error);
  }
};
```

---

## Key Takeaways

1. **Routes are thin** - Just middleware and controller method
2. **Controllers are thin** - Just HTTP concerns (req/res)
3. **Services handle business logic** - Data operations, validation
4. **Middleware handles cross-cutting concerns** - Auth, validation
5. **Presentation service handles UI concerns** - Permission flags, formatting
6. **Everything is testable** - Each layer can be tested independently

This architecture makes it easy to:
- Add new endpoints (copy a pattern)
- Test business logic (mock services)
- Change authorization (update middleware)
- Add new UI properties (update presentation service)
- Support multiple clients (web, mobile) with same services
