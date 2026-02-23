# MVCS Architecture - Quick Reference Guide

**For Developers Working on the Travel Planner API**

This guide provides quick reference for working with the MVCS architecture patterns established in the refactoring.

---

## Architecture Overview

```
Routes (3-5 lines)
  ↓ middleware
Controllers (10-15 lines/method)
  ↓
Business Services (orchestration)
  ↓
Data Services (database access)
  ↓
Models

Presentation Services (UI enrichment - optional)
```

---

## Quick Rules

### ✅ DO

- **Routes:** Use middleware + controller only
- **Controllers:** Handle HTTP requests/responses only
- **Business Services:** Put business logic and orchestration here
- **Data Services:** Put database queries here
- **Presentation Services:** Add UI flags (canEdit, canDelete) here
- **Utils:** Only pure functions (no database, no business logic)

### ❌ DON'T

- **Routes:** No business logic, no database access
- **Controllers:** No database access, no business logic
- **Business Services:** No presentation logic (canEdit flags)
- **Data Services:** No business rules, no presentation
- **Presentation Services:** No database access, no business logic
- **Utils:** No database access, no stateful operations

---

## Common Patterns

### 1. Adding a New Route

```javascript
// routes/api/v1/items.js
const express = require('express');
const { ensureAuthenticated } = require('../../../middleware/auth');
const { checkTripAccess } = require('../../../middleware/authorization');
const itemController = require('../../../controllers/itemController');

const router = express.Router();
router.use(ensureAuthenticated);

// Pattern: middleware → controller
router.get('/trips/:tripId', checkTripAccess('view'), itemController.getTripItems);
router.post('/trips/:tripId', checkTripAccess('edit'), itemController.createItem);
router.put('/:id', checkItemOwnership('Item', 'item'), itemController.updateItem);
router.delete('/:id', checkItemOwnership('Item', 'item'), itemController.deleteItem);

module.exports = router;
```

### 2. Creating a Controller Method

```javascript
// controllers/itemController.js
const ItemBusinessService = require('../services/business/ItemBusinessService');
const ItemPresentationService = require('../services/presentation/ItemPresentationService');
const apiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');

const itemBusinessService = new ItemBusinessService();
const itemPresentationService = new ItemPresentationService();

exports.getItem = async (req, res) => {
  try {
    // 1. Call business service (gets raw data)
    const item = await itemBusinessService.getItem(req.params.id, req.user.id);

    if (!item) {
      return apiResponse.notFound(res, 'Item not found');
    }

    // 2. Enrich with presentation service (adds UI flags)
    const enriched = itemPresentationService.enrichItem(item, req.user.id);

    // 3. Return response
    return apiResponse.success(res, enriched, 'Item retrieved');
  } catch (error) {
    logger.error('GET_ITEM_ERROR', { itemId: req.params.id, error: error.message });
    return apiResponse.internalError(res, 'Failed to retrieve item', error);
  }
};
```

**Key Points:**
- 10-15 lines per method
- Delegates to business service
- Uses presentation service for UI
- Structured logging with context
- Consistent error handling

### 3. Creating a Business Service

```javascript
// services/business/ItemBusinessService.js
const ItemDataService = require('../ItemDataService');
const PermissionService = require('../PermissionService');
const cacheService = require('../cacheService');
const logger = require('../../utils/logger');

class ItemBusinessService {
  constructor() {
    this.itemDataService = new ItemDataService();
    this.permissionService = new PermissionService();
  }

  async getItem(itemId, userId) {
    // 1. Get data from data service
    const item = await this.itemDataService.getItemById(itemId);

    if (!item) {
      return null;
    }

    // 2. Check permissions
    if (!this.permissionService.canViewItem(item, userId)) {
      logger.warn('ITEM_ACCESS_DENIED', { itemId, userId });
      return null;
    }

    // 3. Return raw data (no presentation)
    return item;
  }

  async createItem(data, userId) {
    // Business logic, validation, orchestration
    const item = await this.itemDataService.createItem(data, userId);

    // Invalidate caches
    await cacheService.invalidateUserItems(userId);

    return item;
  }
}

module.exports = ItemBusinessService;
```

**Key Points:**
- Calls data service for database access
- Uses permission service for authorization
- Manages caching
- Returns raw data (no UI flags)
- NO presentation logic

### 4. Creating a Data Service

```javascript
// services/ItemDataService.js
const BaseService = require('./BaseService');
const { Item } = require('../models');
const logger = require('../utils/logger');

class ItemDataService extends BaseService {
  constructor() {
    super(Item, 'Item');
  }

  async getItemById(itemId) {
    return await Item.findByPk(itemId);
  }

  async getUserItems(userId, options = {}) {
    const { limit, offset, orderBy = 'createdAt' } = options;

    return await Item.findAll({
      where: { userId },
      order: [[orderBy, 'DESC']],
      limit,
      offset,
    });
  }

  async createItem(data, userId) {
    const item = await this.create({ ...data, userId });
    logger.info('ITEM_CREATED', { itemId: item.id, userId });
    return item;
  }
}

module.exports = ItemDataService;
```

**Key Points:**
- Extends BaseService for CRUD
- Pure data access only
- NO business logic
- NO permissions
- NO presentation
- NO caching (business layer handles it)

### 5. Creating a Presentation Service

```javascript
// services/presentation/ItemPresentationService.js
const PermissionService = require('../PermissionService');

class ItemPresentationService {
  constructor() {
    this.permissionService = new PermissionService();
  }

  enrichItem(item, userId) {
    const json = item.toJSON ? item.toJSON() : { ...item };

    // Add permission flags
    json.canEdit = item.userId === userId;
    json.canDelete = item.userId === userId;
    json.canView = true;
    json.isOwner = item.userId === userId;
    json.isShared = item.userId !== userId;

    return json;
  }

  enrichItems(items, userId) {
    return items.map(item => this.enrichItem(item, userId));
  }
}

module.exports = ItemPresentationService;
```

**Key Points:**
- Adds UI flags only
- NO business logic
- NO data access
- Pure transformation
- Optional (mobile API can skip)

---

## Service Inheritance

### Extending TravelItemService

For new travel item types (flight, hotel, event, etc.):

```javascript
// services/NewItemService.js
const TravelItemService = require('./TravelItemService');

class NewItemService extends TravelItemService {
  constructor(NewItem) {
    // Parameters: (Model, ModelName, itemType)
    super(NewItem, 'NewItem', 'new_item');
  }

  // Add item-specific methods if needed
  async findByCustomCriteria(criteria) {
    // Custom logic here
  }
}

module.exports = NewItemService;
```

**Inherited Methods:**
- `prepareItemData()` - Datetime parsing, geocoding
- `createItem()` - Create with preprocessing
- `updateItem()` - Update with preprocessing
- `deleteItem()` - Delete with cleanup

---

## Middleware Usage

### Authorization Middleware

```javascript
const { checkTripAccess, checkItemOwnership } = require('../../../middleware/authorization');

// Check trip access (view or edit)
router.get('/trips/:tripId', checkTripAccess('view'), controller.getTripItems);
router.post('/trips/:tripId', checkTripAccess('edit'), controller.createItem);

// Check item ownership
router.put('/:id', checkItemOwnership('Item', 'item'), controller.updateItem);
router.delete('/:id', checkItemOwnership('Item', 'item'), controller.deleteItem);
```

**What It Does:**
- Verifies user owns the trip/item
- Returns 403 if access denied
- Attaches verified resources to `req.trip` or `req.item`

---

## Error Handling

### Standard Pattern

```javascript
try {
  const result = await service.doSomething();

  if (!result) {
    return apiResponse.notFound(res, 'Resource not found');
  }

  return apiResponse.success(res, result, 'Success message');
} catch (error) {
  logger.error('OPERATION_ERROR', { context: 'value', error: error.message });

  // Check for known error types
  if (error.statusCode === 403) {
    return apiResponse.forbidden(res, error.message);
  }

  return apiResponse.internalError(res, 'Operation failed', error);
}
```

### API Response Helpers

```javascript
const apiResponse = require('../utils/apiResponse');

// Success responses
apiResponse.success(res, data, message); // 200
apiResponse.created(res, data, message); // 201
apiResponse.noContent(res); // 204

// Error responses
apiResponse.badRequest(res, message); // 400
apiResponse.forbidden(res, message); // 403
apiResponse.notFound(res, message); // 404
apiResponse.internalError(res, message, error); // 500

// Paginated responses
apiResponse.paginated(res, data, pagination, message);
```

---

## Testing Patterns

### Unit Test - Service Layer

```javascript
// tests/unit/services/ItemBusinessService.test.js
const ItemBusinessService = require('../../../services/business/ItemBusinessService');
const ItemDataService = require('../../../services/ItemDataService');
const PermissionService = require('../../../services/PermissionService');

// Mock dependencies
jest.mock('../../../services/ItemDataService');
jest.mock('../../../services/PermissionService');

describe('ItemBusinessService', () => {
  let service;
  let mockDataService;
  let mockPermissionService;

  beforeEach(() => {
    mockDataService = new ItemDataService();
    mockPermissionService = new PermissionService();
    service = new ItemBusinessService();
    service.itemDataService = mockDataService;
    service.permissionService = mockPermissionService;
  });

  test('getItem returns item when user has permission', async () => {
    const mockItem = { id: '1', userId: 'user1', name: 'Test' };
    mockDataService.getItemById.mockResolvedValue(mockItem);
    mockPermissionService.canViewItem.mockReturnValue(true);

    const result = await service.getItem('1', 'user1');

    expect(result).toEqual(mockItem);
    expect(mockDataService.getItemById).toHaveBeenCalledWith('1');
    expect(mockPermissionService.canViewItem).toHaveBeenCalledWith(mockItem, 'user1');
  });
});
```

### Integration Test - Full Flow

```javascript
// tests/integration/items.test.js
const request = require('supertest');
const app = require('../../app');

describe('Items API', () => {
  test('GET /api/v1/items/:id returns item with UI flags', async () => {
    const response = await request(app)
      .get('/api/v1/items/123')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty('canEdit');
    expect(response.body.data).toHaveProperty('canDelete');
    expect(response.body.data).toHaveProperty('isOwner');
  });
});
```

---

## Common Scenarios

### Scenario 1: Add a new endpoint to existing controller

1. Add route: `router.get('/custom', controller.customMethod)`
2. Add controller method (10-15 lines)
3. Use existing business service
4. Use existing presentation service
5. Done!

### Scenario 2: Add new business logic

1. Add method to business service
2. Call data service for data access
3. Apply business rules
4. Return raw data
5. Controller uses presentation service to enrich

### Scenario 3: Add new UI flag

1. Add method to presentation service
2. Calculate flag based on raw data
3. Return enriched object
4. Controller calls this method before returning response

### Scenario 4: Add new data query

1. Add method to data service
2. Write Sequelize query
3. Return raw results
4. Business service calls this method

---

## Checklist for New Features

### Before You Start
- [ ] Which layer does this belong in?
- [ ] Is there an existing service I can extend?
- [ ] Do I need to create new middleware?
- [ ] What tests do I need to write?

### During Development
- [ ] Routes are thin (middleware + controller)
- [ ] Controller delegates to services
- [ ] Business logic is in business service
- [ ] Database access is in data service
- [ ] UI flags are in presentation service
- [ ] No direct model access in routes/controllers
- [ ] Structured logging with context
- [ ] Error handling follows pattern

### Before Merging
- [ ] Unit tests for services (80%+ coverage)
- [ ] Integration tests for endpoints
- [ ] No breaking changes to existing APIs
- [ ] Documentation updated
- [ ] Follows established patterns
- [ ] Code review completed

---

## Where to Find Things

### Routes
- Location: `routes/api/v1/*.js`
- Pattern: Middleware + controller
- Size: 3-5 lines per route

### Controllers
- Location: `controllers/*Controller.js`
- Pattern: HTTP handling only
- Size: 10-15 lines per method

### Business Services
- Location: `services/business/*BusinessService.js`
- Pattern: Orchestration, permissions, caching
- Calls: Data services, permission service

### Data Services
- Location: `services/*DataService.js` or `services/*Service.js`
- Pattern: Pure data access
- Extends: BaseService or TravelItemService

### Presentation Services
- Location: `services/presentation/*PresentationService.js`
- Pattern: UI enrichment only
- Adds: canEdit, canDelete, isOwner, isShared, isAllDay

### Middleware
- Location: `middleware/*.js`
- Types: auth, authorization, validation
- Usage: Applied in routes

### Utils
- Location: `utils/*.js`
- Pattern: Pure functions only
- Examples: dateFormatter, timezoneHelper, logger, apiResponse

---

## Getting Help

### Documentation
1. `MVCS_REFACTORING_FINAL_SUMMARY.md` - Complete refactoring details
2. `MVCS_REFACTORING_PHASE*_COMPLETE.md` - Phase-specific details
3. `PHASE1_USAGE_EXAMPLES.md` - Concrete examples
4. `MVCS_ARCHITECTURE_GUIDE.md` - This document

### Code Examples
- Look at existing controllers for patterns
- FlightController, HotelController - Good examples
- TripController - Complex example with presentation
- All follow same pattern

### When in Doubt
- Follow existing patterns
- Ask in code review
- Refer to documentation
- Keep layers separate

---

**Remember:** The goal is clear separation of concerns. Each layer does ONE thing well, and delegates everything else to other layers.

**Happy Coding!** 🚀
