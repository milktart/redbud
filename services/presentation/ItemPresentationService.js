/**
 * Item Presentation Service
 *
 * Handles presentation-layer enrichment for travel items (flights, hotels, events, etc.).
 * Separates UI concerns from business logic by adding view-specific properties.
 *
 * This service is used by controllers to prepare data for frontend consumption.
 * Raw data services should NOT call this - only presentation/controller layers.
 *
 * Benefits:
 * - Clean separation: business logic vs. presentation logic
 * - Enables different API versions (e.g., mobile API without UI flags)
 * - Consistent enrichment across all item types
 * - Single place to update UI-related properties
 *
 * Usage:
 *   const ItemPresentationService = require('../services/presentation/ItemPresentationService');
 *   const presentationService = new ItemPresentationService();
 *
 *   // In controller (for web UI):
 *   const enrichedHotel = presentationService.enrichItem(hotel, req.user.id);
 *
 *   // In controller (for mobile API - raw data):
 *   res.json(hotel); // No enrichment
 */

const PermissionService = require('../PermissionService');

class ItemPresentationService {
  constructor() {
    this.permissionService = new PermissionService();
  }

  /**
   * Enrich a single travel item with UI properties
   *
   * Adds permission flags and ownership information for frontend display.
   * Does NOT modify the original item - returns a new object.
   *
   * @param {Object} item - Travel item (Flight, Hotel, Event, Transportation, CarRental)
   * @param {string} userId - Current user ID
   * @returns {Object} Enriched item with UI properties
   *
   * Added properties:
   * - canEdit: boolean - User can edit this item
   * - canDelete: boolean - User can delete this item
   * - canView: boolean - User can view this item
   * - isOwner: boolean - User owns this item
   * - isShared: boolean - Item is shared with user (not owner)
   *
   * @example
   * const hotel = await Hotel.findByPk(hotelId);
   * const enriched = presentationService.enrichItem(hotel, req.user.id);
   * // enriched = { ...hotel, canEdit: true, canDelete: true, isOwner: true, isShared: false }
   */
  enrichItem(item, userId) {
    if (!item) {
      return null;
    }

    // Convert Sequelize instance to plain object if needed
    const plainItem = item.toJSON ? item.toJSON() : { ...item };

    // Add permission flags
    const permissions = this.permissionService.getItemPermissions(item, userId);

    return {
      ...plainItem,
      canEdit: permissions.canEdit,
      canDelete: permissions.canDelete,
      canView: permissions.canView,
      isOwner: permissions.isOwner,
      isShared: permissions.isShared,
    };
  }

  /**
   * Enrich a travel item with explicitly provided permission flags
   *
   * Use this when permission has already been determined asynchronously
   * (e.g., after calling permissionService.canManageItemAsync).
   *
   * @param {Object} item - Travel item
   * @param {string} userId - Current user ID
   * @param {Object} flags - Permission flags
   * @param {boolean} flags.canView - User can view
   * @param {boolean} flags.canEdit - User can edit
   * @param {boolean} flags.canDelete - User can delete
   * @returns {Object} Enriched item with UI properties
   */
  enrichItemWithFlags(item, userId, flags = {}) {
    if (!item) return null;
    const plainItem = item.toJSON ? item.toJSON() : { ...item };
    const isOwner = plainItem.userId === userId || plainItem.createdBy === userId;
    return {
      ...plainItem,
      canView: flags.canView !== undefined ? flags.canView : isOwner,
      canEdit: flags.canEdit !== undefined ? flags.canEdit : isOwner,
      canDelete: flags.canDelete !== undefined ? flags.canDelete : isOwner,
      isOwner,
      isShared: !isOwner,
    };
  }

  /**
   * Enrich multiple travel items with UI properties
   *
   * Batch version of enrichItem() for arrays.
   *
   * @param {Array} items - Array of travel items
   * @param {string} userId - Current user ID
   * @returns {Array} Array of enriched items
   *
   * @example
   * const hotels = await Hotel.findAll({ where: { tripId } });
   * const enriched = presentationService.enrichItems(hotels, req.user.id);
   */
  enrichItems(items, userId) {
    if (!items || !Array.isArray(items)) {
      return [];
    }

    return items.map((item) => this.enrichItem(item, userId));
  }

  /**
   * Enrich a trip with UI properties
   *
   * Similar to enrichItem but for Trip objects.
   * Adds trip-specific permission flags.
   *
   * @param {Object} trip - Trip object
   * @param {string} userId - Current user ID
   * @returns {Object} Enriched trip with UI properties
   */
  enrichTrip(trip, userId) {
    if (!trip) {
      return null;
    }

    // Convert Sequelize instance to plain object if needed
    const plainTrip = trip.toJSON ? trip.toJSON() : { ...trip };

    // Add permission flags
    const permissions = this.permissionService.getTripPermissions(trip, userId);

    return {
      ...plainTrip,
      canEdit: permissions.canEdit,
      canDelete: permissions.canDelete,
      canView: permissions.canView,
      isOwner: permissions.isOwner,
      isShared: permissions.isShared,
    };
  }

  /**
   * Enrich multiple trips with UI properties
   *
   * @param {Array} trips - Array of trip objects
   * @param {string} userId - Current user ID
   * @returns {Array} Array of enriched trips
   */
  enrichTrips(trips, userId) {
    if (!trips || !Array.isArray(trips)) {
      return [];
    }

    return trips.map((trip) => this.enrichTrip(trip, userId));
  }

  /**
   * Add isAllDay flag to events
   *
   * Events without specific times are considered "all-day" events.
   * This is a presentation concern - helps frontend decide how to display the event.
   *
   * @param {Object} event - Event object
   * @returns {Object} Event with isAllDay flag
   *
   * @example
   * const event = { name: 'Conference', startDate: '2024-03-15', startTime: null };
   * const enriched = presentationService.addIsAllDayFlag(event);
   * // enriched.isAllDay === true
   */
  addIsAllDayFlag(event) {
    if (!event) {
      return null;
    }

    const plainEvent = event.toJSON ? event.toJSON() : { ...event };

    // Event is "all-day" if it has no specific start/end times
    const isAllDay = !plainEvent.startTime && !plainEvent.endTime;

    return {
      ...plainEvent,
      isAllDay,
    };
  }

  /**
   * Add isAllDay flags to multiple events
   *
   * @param {Array} events - Array of event objects
   * @returns {Array} Events with isAllDay flags
   */
  addIsAllDayFlags(events) {
    if (!events || !Array.isArray(events)) {
      return [];
    }

    return events.map((event) => this.addIsAllDayFlag(event));
  }

  /**
   * Enrich event with both permission flags and isAllDay flag
   *
   * Convenience method that combines enrichItem() and addIsAllDayFlag().
   *
   * @param {Object} event - Event object
   * @param {string} userId - Current user ID
   * @returns {Object} Fully enriched event
   */
  enrichEvent(event, userId) {
    const enriched = this.enrichItem(event, userId);
    return this.addIsAllDayFlag(enriched);
  }

  /**
   * Enrich multiple events with both permission flags and isAllDay flags
   *
   * @param {Array} events - Array of event objects
   * @param {string} userId - Current user ID
   * @returns {Array} Fully enriched events
   */
  enrichEvents(events, userId) {
    if (!events || !Array.isArray(events)) {
      return [];
    }

    return events.map((event) => this.enrichEvent(event, userId));
  }
}

module.exports = ItemPresentationService;
