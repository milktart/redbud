# Companion & Attendee API Documentation

## Overview

The companion and attendee system provides two complementary ways to share trips and travel items:

1. **Companions** - Global user-to-user relationships with permissions that apply to ALL of a user's trips/items
2. **Attendees** - Local permissions specific to individual trips/items

## Authentication

All endpoints require authentication. Include session cookie or authentication token with requests.

## Companion Endpoints

### Add Companion

Create a bidirectional companion relationship with another user.

**Endpoint:** `POST /api/v1/companions`

**Request Body:**
```json
{
  "email": "companion@example.com",
  "permissionLevel": "view"  // Optional, defaults to "view"
}
```

**Permission Levels:**
- `view` - Can view all your trips/items
- `manage_all` - Can view and edit all your trips/items (cannot delete)

**Response:** `201 Created`
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "userId": "your-user-id",
    "companionUserId": "companion-user-id",
    "permissionLevel": "view",
    "companionUser": {
      "id": "companion-user-id",
      "email": "companion@example.com",
      "firstName": "John",
      "lastName": "Doe"
    },
    "createdAt": "2026-02-15T10:00:00Z",
    "updatedAt": "2026-02-15T10:00:00Z"
  },
  "message": "Companion added successfully"
}
```

**Notes:**
- Creates TWO records: one for you → companion, one for companion → you
- Your companion gets the permission level you specify
- The companion automatically gets 'none' permission for your resources until they grant you access
- Cannot add yourself as a companion
- Email must belong to registered user

**Errors:**
- `404` - User with email not found
- `409` - Companion relationship already exists
- `400` - Invalid email or permission level

---

### List My Companions

Get all companions you have added.

**Endpoint:** `GET /api/v1/companions`

**Response:** `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "userId": "your-user-id",
      "companionUserId": "companion-user-id",
      "permissionLevel": "view",
      "companionUser": {
        "id": "companion-user-id",
        "email": "companion@example.com",
        "firstName": "John",
        "lastName": "Doe"
      },
      "createdAt": "2026-02-15T10:00:00Z",
      "updatedAt": "2026-02-15T10:00:00Z"
    }
  ],
  "message": "Retrieved 1 companions"
}
```

---

### List Companions Who Added Me

Get all users who have added you as their companion.

**Endpoint:** `GET /api/v1/companions/received`

**Response:** `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "userId": "other-user-id",
      "companionUserId": "your-user-id",
      "permissionLevel": "view",
      "user": {
        "id": "other-user-id",
        "email": "other@example.com",
        "firstName": "Jane",
        "lastName": "Smith"
      },
      "createdAt": "2026-02-14T15:00:00Z",
      "updatedAt": "2026-02-14T15:00:00Z"
    }
  ],
  "message": "Retrieved 1 companions who added you"
}
```

**Notes:**
- Shows users who can see your trips/items
- Shows the permission level THEY have given YOU

---

### Update Companion Permission

Change the permission level for a companion.

**Endpoint:** `PUT /api/v1/companions/:companionUserId`

**Request Body:**
```json
{
  "permissionLevel": "manage_all"
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "userId": "your-user-id",
    "companionUserId": "companion-user-id",
    "permissionLevel": "manage_all",
    "companionUser": {
      "id": "companion-user-id",
      "email": "companion@example.com",
      "firstName": "John",
      "lastName": "Doe"
    },
    "createdAt": "2026-02-15T10:00:00Z",
    "updatedAt": "2026-02-15T10:30:00Z"
  },
  "message": "Companion permission updated successfully"
}
```

**Valid Permission Levels:**
- `none` - No permissions
- `view` - Can view all trips/items
- `manage_all` - Can view and edit all trips/items

**Errors:**
- `404` - Companion relationship not found
- `400` - Invalid permission level

---

### Remove Companion

Remove a companion relationship.

**Endpoint:** `DELETE /api/v1/companions/:companionUserId`

**Response:** `200 OK`
```json
{
  "success": true,
  "data": null,
  "message": "Companion removed successfully"
}
```

**Notes:**
- Removes BOTH sides of the relationship
- You will no longer see their trips, they will no longer see yours
- Irreversible - must re-add to restore

---

## Attendee Endpoints

### Add Attendee

Add a user as an attendee to a specific trip or item.

**Endpoint:** `POST /api/v1/attendees`

**Request Body:**
```json
{
  "email": "attendee@example.com",
  "itemType": "trip",
  "itemId": "trip-uuid",
  "permissionLevel": "view"  // Optional, defaults to "view"
}
```

**Item Types:**
- `trip`
- `flight`
- `hotel`
- `event`
- `transportation`
- `car_rental`

**Permission Levels:**
- `view` - Can view this specific trip/item
- `manage` - Can view and edit this specific trip/item (cannot delete)

**Response:** `201 Created`
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "userId": "attendee-user-id",
    "itemType": "trip",
    "itemId": "trip-uuid",
    "permissionLevel": "view",
    "addedBy": "your-user-id",
    "user": {
      "id": "attendee-user-id",
      "email": "attendee@example.com",
      "firstName": "Alice",
      "lastName": "Johnson"
    },
    "createdAt": "2026-02-15T11:00:00Z",
    "updatedAt": "2026-02-15T11:00:00Z"
  },
  "message": "Attendee added successfully"
}
```

**Cascade Behavior (itemType='trip'):**
- When adding an attendee to a trip, they are automatically added to ALL existing items in that trip
- Subsequent items created in the trip will also include this attendee
- Removing from trip removes from all items

**Errors:**
- `404` - User with email not found or trip/item not found
- `409` - User is already an attendee
- `400` - Invalid itemType or missing required fields

---

### List Attendees

Get all attendees for a specific trip or item.

**Endpoint:** `GET /api/v1/attendees?itemType=trip&itemId=trip-uuid`

**Query Parameters:**
- `itemType` (required) - Type of item
- `itemId` (required) - UUID of the trip/item

**Response:** `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "userId": "attendee-user-id",
      "itemType": "trip",
      "itemId": "trip-uuid",
      "permissionLevel": "view",
      "addedBy": "creator-user-id",
      "user": {
        "id": "attendee-user-id",
        "email": "attendee@example.com",
        "firstName": "Alice",
        "lastName": "Johnson"
      },
      "addedByUser": {
        "id": "creator-user-id",
        "email": "creator@example.com",
        "firstName": "Bob",
        "lastName": "Creator"
      },
      "createdAt": "2026-02-15T11:00:00Z",
      "updatedAt": "2026-02-15T11:00:00Z"
    }
  ],
  "message": "Retrieved 1 attendees"
}
```

**Errors:**
- `400` - Missing itemType or itemId query parameters

---

### Update Attendee Permission

Change the permission level for an attendee.

**Endpoint:** `PUT /api/v1/attendees/:attendeeId`

**Request Body:**
```json
{
  "permissionLevel": "manage"
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "userId": "attendee-user-id",
    "itemType": "trip",
    "itemId": "trip-uuid",
    "permissionLevel": "manage",
    "addedBy": "creator-user-id",
    "user": {
      "id": "attendee-user-id",
      "email": "attendee@example.com",
      "firstName": "Alice",
      "lastName": "Johnson"
    },
    "createdAt": "2026-02-15T11:00:00Z",
    "updatedAt": "2026-02-15T11:15:00Z"
  },
  "message": "Attendee permission updated successfully"
}
```

**Valid Permission Levels:**
- `view` - Can view the trip/item
- `manage` - Can view and edit the trip/item

**Errors:**
- `404` - Attendee not found
- `400` - Invalid permission level

---

### Remove Attendee

Remove an attendee from a trip or item.

**Endpoint:** `DELETE /api/v1/attendees/:attendeeId`

**Response:** `200 OK`
```json
{
  "success": true,
  "data": null,
  "message": "Attendee removed successfully"
}
```

**Authorization:**
- Creator of trip/item can remove any attendee
- Attendees can remove themselves
- Cannot remove the creator

**Cascade Behavior (itemType='trip'):**
- Removing from trip removes from ALL items in that trip

**Errors:**
- `404` - Attendee not found or item not found
- `403` - Cannot remove creator or insufficient permission
- `403` - Trying to remove creator as attendee

---

## Permission System

### How Permissions Work

When checking if a user can perform an action on a trip/item:

**View Permission:**
```
Can view if:
  - User is the creator (createdBy)
  OR
  - User is an attendee (with view or manage permission)
  OR
  - User is a companion of the creator with 'view' or 'manage_all' permission
```

**Manage Permission (Edit):**
```
Can edit if:
  - User is the creator (createdBy)
  OR
  - User is an attendee with 'manage' permission
  OR
  - User is a companion of the creator with 'manage_all' permission
```

**Delete Permission:**
```
Can delete ONLY if:
  - User is the creator (createdBy)
```

### Permission Priority

1. **Creator** - Always has full control (view, edit, delete)
2. **Companion manage_all** - Can view and edit ALL creator's items (cannot delete)
3. **Attendee manage** - Can view and edit SPECIFIC item (cannot delete)
4. **Companion view** - Can view ALL creator's items (cannot edit)
5. **Attendee view** - Can view SPECIFIC item (cannot edit)

### Example Scenarios

**Scenario 1: Travel Partner**
- Alice creates trip "Europe 2026"
- Alice adds Bob as companion with `manage_all` permission
- Bob can now view and edit ALL of Alice's trips and items
- Bob CANNOT delete Alice's trips

**Scenario 2: Specific Trip Sharing**
- Alice creates trip "Work Conference"
- Alice adds Carol as attendee with `manage` permission
- Carol can view and edit "Work Conference" and its items
- Carol CANNOT see Alice's other trips
- Carol CANNOT delete the trip

**Scenario 3: View-Only Access**
- Alice creates trip "Vacation"
- Alice adds Dave as attendee with `view` permission
- Dave can see "Vacation" and its items
- Dave CANNOT edit anything
- Dave CAN remove himself as attendee

**Scenario 4: Cascade Behavior**
- Alice creates trip "Hawaii" with flight, hotel, event
- Alice adds Eve as trip attendee with `view` permission
- Eve is automatically added to: flight, hotel, event (all with `view`)
- Alice adds car rental to trip
- Eve is automatically added to car rental with `view`
- Alice removes Eve from trip
- Eve is automatically removed from: flight, hotel, event, car rental

---

## Best Practices

### When to Use Companions
- Long-term travel partners who should access all your trips
- Spouse/partner who helps manage all travel
- Assistant who manages your travel arrangements

### When to Use Attendees
- Specific trip participants (friends on a vacation)
- Co-workers on a business trip
- One-time shared trips
- Fine-grained per-trip control

### Permission Guidelines
- Start with `view` permission, upgrade to `manage` as needed
- Use `manage_all` companion permission sparingly (trusted users only)
- Remove companions/attendees when no longer needed
- Only creator should delete trips (prevents accidental data loss)

### Security Tips
- Verify email addresses before adding companions/attendees
- Regularly review companion relationships
- Use attendee permissions for temporary access
- Audit `addedBy` field to track who granted access

---

## Error Responses

All errors follow this format:

```json
{
  "success": false,
  "message": "Error description",
  "statusCode": 400
}
```

**Common Status Codes:**
- `400` - Bad Request (invalid input)
- `401` - Unauthorized (not authenticated)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found (resource doesn't exist)
- `409` - Conflict (duplicate entry)
- `500` - Internal Server Error

---

## Rate Limiting

Standard API rate limits apply:
- 100 requests per minute per user
- 1000 requests per hour per user

Exceeding limits returns `429 Too Many Requests`.

---

## Changelog

### v2.0.0 (2026-02-15)
- **BREAKING:** Replaced old 5-model companion system with new 2-model system
- Added bidirectional companion relationships
- Added polymorphic attendee system
- Added `createdBy` field to all trips/items
- Added cascade behavior for trip attendees
- Simplified permission model
- Removed `inheritedFromTrip` complexity

### v1.0.0 (Previous)
- Initial companion system (deprecated)
