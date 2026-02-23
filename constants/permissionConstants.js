/**
 * Permission Constants
 *
 * Defines permission levels for the companion and attendee systems.
 */

const PERMISSION_LEVELS = {
  // Companion permission levels (global user-to-user relationships)
  COMPANION: {
    NONE: 'none', // No permissions (default for reciprocal relationship)
    VIEW: 'view', // Can view all trips/items
    MANAGE_ALL: 'manage_all', // Can view and edit all trips/items (cannot delete)
  },

  // Attendee permission levels (specific to individual trips/items)
  ATTENDEE: {
    VIEW: 'view', // Can view the trip/item
    MANAGE: 'manage', // Can view and edit the trip/item (cannot delete)
  },
};

const ITEM_TYPES = {
  TRIP: 'trip',
  FLIGHT: 'flight',
  HOTEL: 'hotel',
  EVENT: 'event',
  TRANSPORTATION: 'transportation',
  CAR_RENTAL: 'car_rental',
};

// Valid permission levels for companions
const VALID_COMPANION_PERMISSIONS = Object.values(PERMISSION_LEVELS.COMPANION);

// Valid permission levels for attendees
const VALID_ATTENDEE_PERMISSIONS = Object.values(PERMISSION_LEVELS.ATTENDEE);

// Valid item types
const VALID_ITEM_TYPES = Object.values(ITEM_TYPES);

module.exports = {
  PERMISSION_LEVELS,
  ITEM_TYPES,
  VALID_COMPANION_PERMISSIONS,
  VALID_ATTENDEE_PERMISSIONS,
  VALID_ITEM_TYPES,
};
