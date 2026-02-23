/**
 * Travel Item Service Base Class
 * Extends BaseService with common logic for all travel items
 * Handles: creation, updates, geocoding, timezone conversion, attendees
 */

const BaseService = require('./BaseService');
const logger = require('../utils/logger');
const DateTimeService = require('./DateTimeService');
const { geocodeWithAirportFallback } = require('../controllers/helpers/resourceController');
const AttendeeService = require('./AttendeeService');
const PermissionService = require('./PermissionService');

class TravelItemService extends BaseService {
  constructor(model, modelName, itemType) {
    super(model, modelName);
    this.itemType = itemType;
    this.attendeeService = new AttendeeService();
    this.permissionService = new PermissionService();
  }

  /**
   * Process and prepare item data for creation/update
   * Handles: datetime parsing, timezone sanitization, geocoding
   * @param {Object} data - Raw item data from request
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} Processed item data ready for database
   */
  async prepareItemData(data, options = {}) {
    try {
      let processedData = { ...data };

      // 1. Combine and parse datetime fields if needed
      if (options.datePairs) {
        processedData = DateTimeService.combineDateTimeFields(processedData, options.datePairs);
      }

      // 2. Sanitize timezone fields
      if (options.timezoneFields) {
        processedData = DateTimeService.sanitizeTimezones(processedData, options.timezoneFields);
      }

      // 3. Geocode location fields if needed
      if (options.locationFields && options.geocodeService) {
        for (const locField of options.locationFields) {
          const tzField = options.timezoneFields?.[options.locationFields.indexOf(locField)];
          const location = processedData[locField];

          if (location) {
            const geocodeResult = await geocodeWithAirportFallback(
              location,
              options.geocodeService,
              processedData[tzField]
            );

            // Update location and timezone from geocoding result
            processedData[locField] = geocodeResult.formattedLocation;

            // Determine field names for timezone and coordinates
            // Handle both "Location"-suffixed fields (pickupLocation) and non-suffixed (origin)
            let baseFieldName = locField;
            if (locField.endsWith('Location')) {
              baseFieldName = locField.replace('Location', '');
            }

            const tzKey = `${baseFieldName}Timezone`;
            if (!processedData[tzKey]) {
              processedData[tzKey] = geocodeResult.timezone;
            }

            // Store coordinates
            const latKey = `${baseFieldName}Lat`;
            const lngKey = `${baseFieldName}Lng`;
            if (geocodeResult.coords) {
              processedData[latKey] = geocodeResult.coords.lat;
              processedData[lngKey] = geocodeResult.coords.lng;
            }
          }
        }
      }

      // 4. Convert datetimes to UTC
      if (options.dateTimeFields && options.tzPairs) {
        options.dateTimeFields.forEach((dtField, index) => {
          const tzField = options.tzPairs[index];

          if (processedData[dtField]) {
            processedData[dtField] = DateTimeService.convertToUTC(
              processedData[dtField],
              processedData[tzField]
            );
          }
        });
      }

      return processedData;
    } catch (error) {
      logger.error(`Error preparing ${this.modelName} data:`, error);
      throw error;
    }
  }

  /**
   * Create a new travel item with optional trip association and attendees
   * @param {Object} data - Item data (already processed by prepareItemData)
   * @param {string} userId - User ID of item owner
   * @param {Object} options - Creation options
   * @param {string} options.tripId - Optional trip ID to associate with
   * @returns {Promise<Object>} Created item with attendees
   */
  async createItem(data, userId, options = {}) {
    try {
      // Create the item with createdBy set to userId
      const itemData = {
        ...data,
        userId,
        createdBy: userId,
      };

      const item = await this.create(itemData);

      // Add creator as attendee with manage permission
      await this.attendeeService.addAttendee(
        this.itemType,
        item.id,
        userId,
        'manage',
        userId
      );

      // Inherit trip attendees if tripId provided
      if (options.tripId) {
        await this.attendeeService.inheritTripAttendees(options.tripId, this.itemType, item.id);
      }

      logger.info(`${this.modelName} created successfully - ID: ${item.id}, UserID: ${userId}`);

      return item;
    } catch (error) {
      logger.error(`Error creating ${this.modelName}:`, error);
      throw error;
    }
  }

  /**
   * Update an existing travel item
   * @param {Object} item - Item instance to update
   * @param {Object} data - Update data (already processed by prepareItemData)
   * @param {string} userId - User ID performing the update
   * @returns {Promise<Object>} Updated item
   */
  async updateItem(item, data, userId) {
    try {
      // Check if user has permission to update
      const canManage = await this.permissionService.canManageItemAsync(
        { ...item.toJSON(), itemType: this.itemType },
        userId
      );

      if (!canManage) {
        throw new Error('You do not have permission to update this item');
      }

      const updatedItem = await this.update(item, data);

      logger.info(`${this.modelName} updated successfully - ID: ${item.id}`);

      return updatedItem;
    } catch (error) {
      logger.error(`Error updating ${this.modelName}:`, error);
      throw error;
    }
  }

  /**
   * Delete a travel item and cascade delete relationships
   * @param {Object} item - Item instance to delete
   * @param {string} userId - User ID performing the delete
   * @returns {Promise<void>}
   */
  async deleteItem(item, userId) {
    try {
      // Check if user is the creator (only creator can delete)
      if (!this.attendeeService.canDelete(userId, item.createdBy)) {
        throw new Error('Only the creator can delete this item');
      }

      // Attendees will be cascade deleted by database foreign key constraint

      // Delete the item
      await this.delete(item);

      logger.info(`${this.modelName} deleted successfully - ID: ${item.id}`);
    } catch (error) {
      logger.error(`Error deleting ${this.modelName}:`, error);
      throw error;
    }
  }

  /**
   * Restore a soft-deleted travel item
   * @param {Object} item - Item instance to restore
   * @returns {Promise<Object>} Restored item
   */
  async restoreItem(item) {
    try {
      // Restore the item (implementation depends on soft delete implementation)
      const restored = await this.update(item, {
        deletedAt: null,
      });

      logger.info(`${this.modelName} restored successfully - ID: ${item.id}`);

      return restored;
    } catch (error) {
      logger.error(`Error restoring ${this.modelName}:`, error);
      throw error;
    }
  }

  /**
   * Get item with all associations
   * @param {string} itemId - Item ID
   * @returns {Promise<Object>} Item with attendees, trip, and vouchers
   */
  async getItemWithAssociations(itemId) {
    try {
      const item = await this.findById(itemId);

      if (!item) {
        return null;
      }

      // Load attendees
      const attendees = await this.attendeeService.getAttendees(this.itemType, itemId);

      // Items are now directly linked to trips via tripId foreign key
      // No need for junction table lookup

      return {
        ...item.toJSON(),
        attendees,
      };
    } catch (error) {
      logger.error(`Error loading ${this.modelName} with associations:`, error);
      throw error;
    }
  }
}

module.exports = TravelItemService;
