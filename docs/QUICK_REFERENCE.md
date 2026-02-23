# Companion & Attendee System - Quick Reference

## 🎯 When to Use What

| Scenario | Use | Permission |
|----------|-----|------------|
| Long-term travel partner | **Companion** with `manage_all` | Edit all trips/items |
| View spouse's trips | **Companion** with `view` | View all trips/items |
| Share specific vacation | **Attendee** on trip with `manage` | Edit this trip only |
| Include friend on event | **Attendee** on event with `view` | View this event only |

## 🔑 Permission Levels

### Companion (Global)
- `none` - No access (default reciprocal)
- `view` - View ALL owner's trips/items
- `manage_all` - Edit ALL owner's trips/items (cannot delete)

### Attendee (Local)  
- `view` - View THIS trip/item
- `manage` - Edit THIS trip/item (cannot delete)

### Special Rules
- ✅ **Creator** can always: view, edit, **delete**
- ✅ **Companion manage_all** can: view, edit ALL items
- ✅ **Attendee manage** can: view, edit THIS item
- ❌ **Only creator** can delete (always)

## 📍 Quick API Reference

### Add Companion
```bash
POST /api/v1/companions
{"email": "friend@email.com", "permissionLevel": "view"}
```

### Add Attendee to Trip
```bash
POST /api/v1/attendees
{"email": "friend@email.com", "itemType": "trip", "itemId": "...", "permissionLevel": "view"}
# Automatically added to all items in trip!
```

### Update Permission
```bash
PUT /api/v1/companions/:companionUserId
{"permissionLevel": "manage_all"}
```

### List My Companions
```bash
GET /api/v1/companions
```

### List Trip Attendees
```bash
GET /api/v1/attendees?itemType=trip&itemId=...
```

### Remove Companion
```bash
DELETE /api/v1/companions/:companionUserId
# Removes both sides of relationship
```

### Remove Attendee
```bash
DELETE /api/v1/attendees/:attendeeId
# If trip attendee, removes from all items too
```

## 🔄 Cascade Behavior

### Adding Attendee to Trip
```
1. Add to trip
2. ✅ Automatically add to ALL existing items (flights, hotels, etc.)
3. ✅ Future items in trip inherit this attendee
```

### Removing Attendee from Trip
```
1. Remove from trip
2. ✅ Automatically remove from ALL items in trip
3. ⚠️  Cannot remove if they're the creator
```

### Adding Item to Trip
```
1. Create item with tripId
2. ✅ Automatically inherit ALL trip attendees
3. ✅ Creator added as attendee with manage permission
```

## 💡 Common Patterns

### Share Trip with Friend
```javascript
// Add as trip attendee with manage permission
POST /api/v1/attendees
{
  "email": "friend@email.com",
  "itemType": "trip",
  "itemId": "trip-uuid",
  "permissionLevel": "manage"
}
// Friend can now edit trip and all its items
```

### Make Someone Your Travel Partner
```javascript
// Add as companion with manage_all
POST /api/v1/companions
{
  "email": "partner@email.com",
  "permissionLevel": "manage_all"
}
// Partner can now edit ALL your trips/items
```

### Let Someone View Your Trips
```javascript
// Add as companion with view
POST /api/v1/companions
{
  "email": "viewer@email.com",
  "permissionLevel": "view"
}
// They can see all your trips but not edit
```

### Share Single Event
```javascript
// Add as event attendee with view
POST /api/v1/attendees
{
  "email": "guest@email.com",
  "itemType": "event",
  "itemId": "event-uuid",
  "permissionLevel": "view"
}
// They can see this event only
```

## ⚠️ Important Notes

### Bidirectional Companions
When you add someone as a companion:
- ✅ YOU get them in your list with YOUR chosen permission
- ✅ THEY get you in their list with 'none' permission
- ✅ THEY must grant YOU permission separately
- Use `GET /api/v1/companions/received` to see who added you

### Creator Field
- Set automatically on creation
- **Immutable** - never changes
- Only creator can delete trips/items
- Different from userId (ownership can transfer, creator cannot)

### Cannot Remove Creator
- ❌ Cannot remove trip/item creator as attendee
- Creator always has access
- Creator can remove themselves from attendee list, but still has creator rights

### Attendee vs Companion
- **Attendee** = Specific trip/item access
- **Companion** = Global access to all owner's items
- Attendee permissions override (more specific)
- Companion is fallback when not attendee

## 🧪 Testing Checklist

- [ ] Add companion → verify bidirectional
- [ ] Update companion permission → verify changes
- [ ] Remove companion → verify both sides deleted
- [ ] Add attendee to trip → verify cascade to items
- [ ] Remove attendee from trip → verify cascade removal
- [ ] Try delete as non-creator → verify blocked
- [ ] Try edit as view-only → verify blocked
- [ ] Edit as manage attendee → verify success
- [ ] Create trip → verify creator added as attendee
- [ ] Add item to trip → verify attendees inherited

## 📊 Data Model Quick View

```
Companion
├─ userId ──────────► User (owner)
├─ companionUserId ─► User (companion)
└─ permissionLevel ──► none | view | manage_all

Attendee
├─ userId ──────────► User (attendee)
├─ itemType ────────► trip | flight | hotel | event | transportation | car_rental
├─ itemId ──────────► Polymorphic ID
├─ permissionLevel ─► view | manage
└─ addedBy ─────────► User (who added them)

Trip/Item Models
├─ createdBy ───────► User (creator, immutable)
└─ userId ──────────► User (owner)
```

## 🚀 Deployment Quick Steps

```bash
# 1. Backup database
pg_dump -U $DB_USER $DB_NAME > backup.sql

# 2. Sync database
npm run db:sync

# 3. Verify tables
psql -U $DB_USER -d $DB_NAME -c "\dt" | grep -E "(companions|attendees)"

# 4. Start server
npm start

# 5. Test endpoints
curl http://localhost:3000/api/v1/companions
```

## 📚 Full Documentation

- Migration Guide: `docs/COMPANION_SYSTEM_MIGRATION.md`
- API Reference: `docs/COMPANION_API.md`
- Implementation: `IMPLEMENTATION_COMPLETE.md`

---

**TL;DR:**
- Use **Companions** for global access to all someone's trips
- Use **Attendees** for specific trip/item sharing
- Only **creators** can delete
- **Trip attendees** cascade to all items automatically
