/**
 * ItemPresentationService Unit Tests
 *
 * Tests presentation layer enrichment for travel items.
 */

jest.mock('sequelize', () => ({
  Op: {
    in: Symbol('in'),
    ne: Symbol('ne'),
    gte: Symbol('gte'),
    lte: Symbol('lte'),
    or: Symbol('or'),
    and: Symbol('and'),
    iLike: Symbol('iLike'),
  },
}), { virtual: true });

jest.mock('../../../models', () => ({
  Attendee: { findOne: jest.fn() },
  Companion: { findOne: jest.fn() },
}));

const ItemPresentationService = require('../../../services/presentation/ItemPresentationService');

describe('ItemPresentationService', () => {
  let presentationService;
  const ownerId = 'user-123';
  const otherId = 'user-456';

  beforeEach(() => {
    presentationService = new ItemPresentationService();
  });

  describe('enrichItem', () => {
    it('should enrich item with permission flags for owner', () => {
      const mockItem = {
        id: 'item-1',
        userId: ownerId,
        name: 'Test Hotel',
        toJSON: () => ({ id: 'item-1', userId: ownerId, name: 'Test Hotel' }),
      };

      const enriched = presentationService.enrichItem(mockItem, ownerId);

      expect(enriched).toMatchObject({
        id: 'item-1',
        userId: ownerId,
        name: 'Test Hotel',
        canEdit: true,
        canDelete: true,
        canView: true,
        isOwner: true,
        isShared: false,
      });
    });

    it('should enrich item with permission flags for non-owner', () => {
      const mockItem = {
        id: 'item-1',
        userId: ownerId,
        name: 'Test Hotel',
        toJSON: () => ({ id: 'item-1', userId: ownerId, name: 'Test Hotel' }),
      };

      const enriched = presentationService.enrichItem(mockItem, otherId);

      expect(enriched).toMatchObject({
        id: 'item-1',
        userId: ownerId,
        name: 'Test Hotel',
        canEdit: false,
        canDelete: false,
        canView: false,
        isOwner: false,
        isShared: false,
      });
    });

    it('should handle plain objects without toJSON', () => {
      const mockItem = {
        id: 'item-1',
        userId: ownerId,
        name: 'Test Hotel',
      };

      const enriched = presentationService.enrichItem(mockItem, ownerId);

      expect(enriched).toMatchObject({
        id: 'item-1',
        userId: ownerId,
        name: 'Test Hotel',
        canEdit: true,
        canDelete: true,
        isOwner: true,
      });
    });

    it('should return null for null item', () => {
      const enriched = presentationService.enrichItem(null, ownerId);
      expect(enriched).toBeNull();
    });

    it('should not mutate original item', () => {
      const mockItem = {
        id: 'item-1',
        userId: ownerId,
        name: 'Test Hotel',
      };

      const originalCopy = { ...mockItem };
      presentationService.enrichItem(mockItem, ownerId);

      expect(mockItem).toEqual(originalCopy);
    });
  });

  describe('enrichItems', () => {
    it('should enrich multiple items', () => {
      const mockItems = [
        {
          id: 'item-1',
          userId: ownerId,
          name: 'Hotel 1',
          toJSON: () => ({ id: 'item-1', userId: ownerId, name: 'Hotel 1' }),
        },
        {
          id: 'item-2',
          userId: ownerId,
          name: 'Hotel 2',
          toJSON: () => ({ id: 'item-2', userId: ownerId, name: 'Hotel 2' }),
        },
      ];

      const enriched = presentationService.enrichItems(mockItems, ownerId);

      expect(enriched).toHaveLength(2);
      expect(enriched[0]).toMatchObject({
        id: 'item-1',
        canEdit: true,
        isOwner: true,
      });
      expect(enriched[1]).toMatchObject({
        id: 'item-2',
        canEdit: true,
        isOwner: true,
      });
    });

    it('should return empty array for null items', () => {
      const enriched = presentationService.enrichItems(null, ownerId);
      expect(enriched).toEqual([]);
    });

    it('should return empty array for non-array items', () => {
      const enriched = presentationService.enrichItems({}, ownerId);
      expect(enriched).toEqual([]);
    });
  });

  describe('enrichTrip', () => {
    it('should enrich trip with permission flags for owner', () => {
      const mockTrip = {
        id: 'trip-1',
        userId: ownerId,
        name: 'Test Trip',
        toJSON: () => ({ id: 'trip-1', userId: ownerId, name: 'Test Trip' }),
      };

      const enriched = presentationService.enrichTrip(mockTrip, ownerId);

      expect(enriched).toMatchObject({
        id: 'trip-1',
        userId: ownerId,
        name: 'Test Trip',
        canEdit: true,
        canDelete: true,
        canView: true,
        isOwner: true,
        isShared: false,
      });
    });

    it('should enrich trip with permission flags for non-owner', () => {
      const mockTrip = {
        id: 'trip-1',
        userId: ownerId,
        name: 'Test Trip',
        toJSON: () => ({ id: 'trip-1', userId: ownerId, name: 'Test Trip' }),
      };

      const enriched = presentationService.enrichTrip(mockTrip, otherId);

      expect(enriched).toMatchObject({
        canEdit: false,
        canDelete: false,
        isOwner: false,
      });
    });

    it('should return null for null trip', () => {
      const enriched = presentationService.enrichTrip(null, ownerId);
      expect(enriched).toBeNull();
    });
  });

  describe('enrichTrips', () => {
    it('should enrich multiple trips', () => {
      const mockTrips = [
        {
          id: 'trip-1',
          userId: ownerId,
          name: 'Trip 1',
          toJSON: () => ({ id: 'trip-1', userId: ownerId, name: 'Trip 1' }),
        },
        {
          id: 'trip-2',
          userId: ownerId,
          name: 'Trip 2',
          toJSON: () => ({ id: 'trip-2', userId: ownerId, name: 'Trip 2' }),
        },
      ];

      const enriched = presentationService.enrichTrips(mockTrips, ownerId);

      expect(enriched).toHaveLength(2);
      expect(enriched[0]).toMatchObject({
        id: 'trip-1',
        canEdit: true,
        isOwner: true,
      });
      expect(enriched[1]).toMatchObject({
        id: 'trip-2',
        canEdit: true,
        isOwner: true,
      });
    });

    it('should return empty array for null trips', () => {
      const enriched = presentationService.enrichTrips(null, ownerId);
      expect(enriched).toEqual([]);
    });
  });

  describe('Event-specific enrichment', () => {
    describe('addIsAllDayFlag', () => {
      it('should mark event as all-day when no times provided', () => {
        const mockEvent = {
          id: 'event-1',
          name: 'Conference',
          startDate: '2024-03-15',
          startTime: null,
          endTime: null,
          toJSON: () => ({
            id: 'event-1',
            name: 'Conference',
            startDate: '2024-03-15',
            startTime: null,
            endTime: null,
          }),
        };

        const enriched = presentationService.addIsAllDayFlag(mockEvent);

        expect(enriched.isAllDay).toBe(true);
      });

      it('should mark event as NOT all-day when start time provided', () => {
        const mockEvent = {
          id: 'event-1',
          name: 'Meeting',
          startDate: '2024-03-15',
          startTime: '09:00',
          endTime: null,
          toJSON: () => ({
            id: 'event-1',
            name: 'Meeting',
            startDate: '2024-03-15',
            startTime: '09:00',
            endTime: null,
          }),
        };

        const enriched = presentationService.addIsAllDayFlag(mockEvent);

        expect(enriched.isAllDay).toBe(false);
      });

      it('should mark event as NOT all-day when end time provided', () => {
        const mockEvent = {
          id: 'event-1',
          name: 'Meeting',
          startDate: '2024-03-15',
          startTime: null,
          endTime: '17:00',
          toJSON: () => ({
            id: 'event-1',
            name: 'Meeting',
            startDate: '2024-03-15',
            startTime: null,
            endTime: '17:00',
          }),
        };

        const enriched = presentationService.addIsAllDayFlag(mockEvent);

        expect(enriched.isAllDay).toBe(false);
      });

      it('should handle plain objects without toJSON', () => {
        const mockEvent = {
          id: 'event-1',
          name: 'Conference',
          startDate: '2024-03-15',
        };

        const enriched = presentationService.addIsAllDayFlag(mockEvent);

        expect(enriched.isAllDay).toBe(true);
      });

      it('should return null for null event', () => {
        const enriched = presentationService.addIsAllDayFlag(null);
        expect(enriched).toBeNull();
      });
    });

    describe('addIsAllDayFlags', () => {
      it('should add isAllDay flag to multiple events', () => {
        const mockEvents = [
          {
            id: 'event-1',
            name: 'All Day Event',
            startTime: null,
            endTime: null,
            toJSON: () => ({ id: 'event-1', name: 'All Day Event', startTime: null, endTime: null }),
          },
          {
            id: 'event-2',
            name: 'Timed Event',
            startTime: '09:00',
            endTime: '17:00',
            toJSON: () => ({
              id: 'event-2',
              name: 'Timed Event',
              startTime: '09:00',
              endTime: '17:00',
            }),
          },
        ];

        const enriched = presentationService.addIsAllDayFlags(mockEvents);

        expect(enriched).toHaveLength(2);
        expect(enriched[0].isAllDay).toBe(true);
        expect(enriched[1].isAllDay).toBe(false);
      });

      it('should return empty array for null events', () => {
        const enriched = presentationService.addIsAllDayFlags(null);
        expect(enriched).toEqual([]);
      });
    });

    describe('enrichEvent', () => {
      it('should enrich event with both permissions and isAllDay flag', () => {
        const mockEvent = {
          id: 'event-1',
          userId: ownerId,
          name: 'Conference',
          startTime: null,
          endTime: null,
          toJSON: () => ({
            id: 'event-1',
            userId: ownerId,
            name: 'Conference',
            startTime: null,
            endTime: null,
          }),
        };

        const enriched = presentationService.enrichEvent(mockEvent, ownerId);

        expect(enriched).toMatchObject({
          id: 'event-1',
          userId: ownerId,
          name: 'Conference',
          canEdit: true,
          canDelete: true,
          isOwner: true,
          isAllDay: true,
        });
      });
    });

    describe('enrichEvents', () => {
      it('should enrich multiple events with permissions and isAllDay flags', () => {
        const mockEvents = [
          {
            id: 'event-1',
            userId: ownerId,
            name: 'All Day',
            startTime: null,
            toJSON: () => ({ id: 'event-1', userId: ownerId, name: 'All Day', startTime: null }),
          },
          {
            id: 'event-2',
            userId: ownerId,
            name: 'Timed',
            startTime: '09:00',
            toJSON: () => ({ id: 'event-2', userId: ownerId, name: 'Timed', startTime: '09:00' }),
          },
        ];

        const enriched = presentationService.enrichEvents(mockEvents, ownerId);

        expect(enriched).toHaveLength(2);
        expect(enriched[0]).toMatchObject({
          canEdit: true,
          isAllDay: true,
        });
        expect(enriched[1]).toMatchObject({
          canEdit: true,
          isAllDay: false,
        });
      });
    });
  });

  describe('sanitizeItem', () => {
    it('should return plain item object', () => {
      const mockItem = {
        id: 'item-1',
        userId: ownerId,
        name: 'Test Item',
        toJSON: () => ({ id: 'item-1', userId: ownerId, name: 'Test Item' }),
      };

      const sanitized = presentationService.sanitizeItem(mockItem, ownerId);

      expect(sanitized).toEqual({
        id: 'item-1',
        userId: ownerId,
        name: 'Test Item',
      });
    });

    it('should return null for null item', () => {
      const sanitized = presentationService.sanitizeItem(null, ownerId);
      expect(sanitized).toBeNull();
    });
  });

  describe('formatItemDates', () => {
    it('should return item with dates unchanged (placeholder method)', () => {
      const mockItem = {
        id: 'item-1',
        checkInDate: '2024-03-15T14:00:00Z',
        toJSON: () => ({ id: 'item-1', checkInDate: '2024-03-15T14:00:00Z' }),
      };

      const formatted = presentationService.formatItemDates(mockItem);

      expect(formatted).toEqual({
        id: 'item-1',
        checkInDate: '2024-03-15T14:00:00Z',
      });
    });

    it('should return null for null item', () => {
      const formatted = presentationService.formatItemDates(null);
      expect(formatted).toBeNull();
    });
  });
});
