/**
 * Trip Presentation Service
 * Handles UI enrichment for trips and travel items
 *
 * Phase 4 Refactoring: Extracted from tripService.js
 * - Presentation layer ONLY (adds UI flags, formats for display)
 * - No business logic
 * - No data access
 * - Uses PermissionService from Phase 1 for permission flags
 *
 * Responsibilities:
 * - Add permission flags (canEdit, canDelete, canView)
 * - Add ownership flags (isOwner, isShared)
 * - Add event-specific flags (isAllDay)
 * - Format data for UI consumption
 * - Convert Sequelize instances to plain objects
 */

const PermissionService = require('../PermissionService');

class TripPresentationService {
  constructor() {
    this.permissionService = new PermissionService();
  }

  /**
   * Enrich a single trip with permission flags
   * @param {Object} trip - Trip instance or plain object
   * @param {string} userId - Current user ID
   * @param {Object} options - Enrichment options
   * @param {boolean} options.canManage - Whether user can manage this trip (edit items).
   *   Pass true for owners and trip attendees with manage permission.
   *   Defaults to ownership check when not provided.
   * @returns {Object} Enriched trip object
   */
  enrichTrip(trip, userId, options = {}) {
    const json = trip.toJSON ? trip.toJSON() : { ...trip };

    const isOwner = json.userId === userId;
    // canManage defaults to isOwner if not explicitly provided
    const canManage = options.canManage !== undefined ? options.canManage : isOwner;

    json.canEdit = isOwner; // only owners can update the trip itself
    json.canDelete = isOwner;
    json.canView = true;
    json.isOwner = isOwner;
    json.isShared = !isOwner;

    // Enrich all travel items within the trip using canManage for item-level edit flags
    if (json.flights) {
      json.flights = json.flights.map((item) => this.enrichTripItem(item, userId, canManage));
    }
    if (json.hotels) {
      json.hotels = json.hotels.map((item) => this.enrichTripItem(item, userId, canManage));
    }
    if (json.transportation) {
      json.transportation = json.transportation.map((item) =>
        this.enrichTripItem(item, userId, canManage)
      );
    }
    if (json.carRentals) {
      json.carRentals = json.carRentals.map((item) => this.enrichTripItem(item, userId, canManage));
    }
    if (json.events) {
      json.events = json.events.map((item) => {
        const enrichedItem = this.enrichTripItem(item, userId, canManage);
        return this.addIsAllDayFlag(enrichedItem);
      });
    }

    return json;
  }

  /**
   * Enrich multiple trips with permission flags
   * @param {Array} trips - Array of Trip instances or plain objects
   * @param {string} userId - Current user ID
   * @returns {Array} Array of enriched trip objects
   */
  enrichTrips(trips, userId) {
    return trips.map((trip) => this.enrichTrip(trip, userId));
  }

  /**
   * Enrich a single travel item within a trip
   * @param {Object} item - Travel item instance or plain object
   * @param {string} userId - Current user ID
   * @param {boolean} canManageTrip - Whether user can manage items in the parent trip
   *   (true for trip owner or trip attendee with manage permission)
   * @returns {Object} Enriched item object
   */
  enrichTripItem(item, userId, canManageTrip) {
    const json = item.toJSON ? item.toJSON() : { ...item };

    const isItemOwner = json.userId === userId;

    // Item edit: item owner OR anyone with trip manage permission
    json.canEdit = isItemOwner || canManageTrip;
    json.canDelete = isItemOwner || canManageTrip;
    json.canView = true;
    json.isOwner = isItemOwner;
    json.isShared = !isItemOwner;

    return json;
  }

  /**
   * Enrich standalone items (not associated with trips)
   * @param {Object} standaloneItems - Object with arrays of items by type
   * @param {string} userId - Current user ID
   * @returns {Object} Enriched standalone items
   */
  enrichStandaloneItems(standaloneItems, userId) {
    return {
      flights: this.enrichStandaloneItemArray(standaloneItems.flights || [], userId),
      hotels: this.enrichStandaloneItemArray(standaloneItems.hotels || [], userId),
      transportation: this.enrichStandaloneItemArray(standaloneItems.transportation || [], userId),
      carRentals: this.enrichStandaloneItemArray(standaloneItems.carRentals || [], userId),
      events: this.enrichStandaloneItemArray(standaloneItems.events || [], userId, true), // true = add isAllDay
    };
  }

  /**
   * Enrich an array of standalone items
   * @param {Array} items - Array of item instances or plain objects
   * @param {string} userId - Current user ID
   * @param {boolean} addIsAllDay - Whether to add isAllDay flag (for events)
   * @returns {Array} Array of enriched item objects
   */
  enrichStandaloneItemArray(items, userId, addIsAllDay = false) {
    return items.map((item) => {
      const json = item.toJSON ? item.toJSON() : { ...item };

      const isOwner = json.userId === userId;
      json.canEdit = isOwner;
      json.canDelete = isOwner;
      json.canView = true;
      json.isOwner = isOwner;
      json.isShared = !isOwner;

      // Preserve itemCompanions if present
      if (item.itemCompanions) {
        json.itemCompanions = item.itemCompanions;
      }

      // Add isAllDay flag for events
      if (addIsAllDay) {
        return this.addIsAllDayFlag(json);
      }

      return json;
    });
  }

  /**
   * Add isAllDay flag to an event based on time values
   * An event is all-day if:
   * - Start time is 00:00 UTC
   * - End time is 23:59 UTC
   * @param {Object} event - Event object (plain object or with dates)
   * @returns {Object} Event with isAllDay flag
   */
  addIsAllDayFlag(event) {
    if (event.startDateTime && event.endDateTime) {
      const startDate = new Date(event.startDateTime);
      const endDate = new Date(event.endDateTime);

      const startHours = startDate.getUTCHours();
      const startMinutes = startDate.getUTCMinutes();
      const endHours = endDate.getUTCHours();
      const endMinutes = endDate.getUTCMinutes();

      event.isAllDay =
        startHours === 0 && startMinutes === 0 && endHours === 23 && endMinutes === 59;
    } else {
      event.isAllDay = false;
    }

    return event;
  }

  /**
   * Add isAllDay flags to multiple events
   * @param {Array} events - Array of event objects
   * @returns {Array} Events with isAllDay flags
   */
  addIsAllDayFlags(events) {
    return events.map((event) => this.addIsAllDayFlag(event));
  }

  /**
   * Enrich trip items with permission flags
   * Helper for enriching items that may be owned by the trip owner or item owner
   * @param {Array} items - Array of item instances
   * @param {string} userId - Current user ID
   * @param {string} tripOwnerId - Trip owner user ID (used to derive canManageTrip when not provided)
   * @param {boolean} addIsAllDay - Whether to add isAllDay flag (for events)
   * @param {boolean|null} canManageTrip - Override: whether user can manage trip items.
   *   When null/undefined, falls back to userId === tripOwnerId.
   * @returns {Array} Array of enriched item objects
   */
  enrichTripItems(items, userId, tripOwnerId, addIsAllDay = false, canManageTrip = null) {
    const effectiveCanManage = canManageTrip !== null ? canManageTrip : userId === tripOwnerId;

    return items.map((item) => {
      const json = item.toJSON ? item.toJSON() : { ...item };

      const isItemOwner = json.userId === userId;

      json.canEdit = isItemOwner || effectiveCanManage;
      json.canDelete = isItemOwner || effectiveCanManage;
      json.canView = true;
      json.isOwner = isItemOwner;
      json.isShared = !isItemOwner;

      if (addIsAllDay) {
        return this.addIsAllDayFlag(json);
      }

      return json;
    });
  }

  /**
   * Build pagination metadata
   * @param {number} page - Current page number
   * @param {number} limit - Items per page
   * @param {number} totalCount - Total count of items
   * @param {string} filter - Filter type ('past', 'upcoming', 'all')
   * @returns {Object} Pagination metadata
   */
  buildPaginationMetadata(page, limit, totalCount, filter) {
    const totalPages = filter === 'past' ? Math.ceil(totalCount / limit) : 1;

    return {
      currentPage: page,
      totalPages,
      totalCount,
      hasNextPage: filter === 'past' && page < totalPages,
      hasPrevPage: filter === 'past' && page > 1,
    };
  }

  /**
   * Enrich a complete user trips response with all presentation data
   * @param {Object} data - Raw trip data from business service
   * @param {string} userId - Current user ID
   * @param {Object} paginationOptions - Pagination options
   * @returns {Object} Fully enriched response ready for UI
   */
  enrichUserTripsResponse(data, userId, paginationOptions = {}) {
    const { page = 1, limit = 20, totalCount = 0, filter = 'upcoming' } = paginationOptions;

    return {
      ownedTrips: this.enrichTrips(data.ownedTrips || [], userId),
      attendeeTrips: this.enrichTrips(data.attendeeTrips || [], userId),
      companionTrips: this.enrichTrips(data.companionTrips || [], userId),
      standalone: this.enrichStandaloneItems(data.standalone || {}, userId),
      attendeeStandalone: this.enrichStandaloneItems(data.attendeeStandalone || {}, userId),
      companionStandalone: this.enrichStandaloneItems(data.companionStandalone || {}, userId),
      pagination: this.buildPaginationMetadata(page, limit, totalCount, filter),
    };
  }
}

module.exports = TripPresentationService;
