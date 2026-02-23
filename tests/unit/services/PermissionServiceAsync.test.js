/**
 * PermissionService Async Methods Unit Tests
 *
 * Tests the attendee/companion-aware async permission methods.
 * Mocks Attendee and Companion models to avoid DB dependency.
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

const { Attendee, Companion } = require('../../../models');
const PermissionService = require('../../../services/PermissionService');

describe('PermissionService async methods', () => {
  let ps;
  const ownerId = 'user-owner';
  const userId = 'user-other';

  beforeEach(() => {
    ps = new PermissionService();
    jest.clearAllMocks();
  });

  // ─── canViewItemAsync ────────────────────────────────────────────────────────

  describe('canViewItemAsync', () => {
    const item = { id: 'item-1', userId: ownerId, createdBy: ownerId, itemType: 'flight', tripId: 'trip-1' };

    it('returns true for owner (userId match)', async () => {
      expect(await ps.canViewItemAsync(item, ownerId)).toBe(true);
      expect(Attendee.findOne).not.toHaveBeenCalled();
    });

    it('returns true for owner (createdBy match)', async () => {
      const i = { ...item, userId: 'someone-else' };
      expect(await ps.canViewItemAsync(i, ownerId)).toBe(true);
    });

    it('returns true when item-level attendee record exists', async () => {
      Attendee.findOne.mockResolvedValueOnce({ id: 'att-1' });
      expect(await ps.canViewItemAsync(item, userId)).toBe(true);
      expect(Attendee.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId, itemType: 'flight', itemId: 'item-1' }) })
      );
    });

    it('returns true when trip-level attendee record exists', async () => {
      Attendee.findOne
        .mockResolvedValueOnce(null)   // item-level: no
        .mockResolvedValueOnce({ id: 'att-trip' }); // trip-level: yes
      expect(await ps.canViewItemAsync(item, userId)).toBe(true);
      expect(Attendee.findOne).toHaveBeenCalledTimes(2);
    });

    it('returns true when companion has view permission', async () => {
      Attendee.findOne.mockResolvedValue(null);
      Companion.findOne.mockResolvedValueOnce({ id: 'comp-1' });
      expect(await ps.canViewItemAsync(item, userId)).toBe(true);
    });

    it('returns false when no attendee and no companion', async () => {
      Attendee.findOne.mockResolvedValue(null);
      Companion.findOne.mockResolvedValueOnce(null);
      expect(await ps.canViewItemAsync(item, userId)).toBe(false);
    });

    it('returns false for null item', async () => {
      expect(await ps.canViewItemAsync(null, userId)).toBe(false);
    });

    it('returns false for null userId', async () => {
      expect(await ps.canViewItemAsync(item, null)).toBe(false);
    });

    it('skips trip-level check when tripId is absent', async () => {
      const itemNoTrip = { ...item, tripId: null };
      Attendee.findOne.mockResolvedValueOnce(null); // item-level only
      Companion.findOne.mockResolvedValueOnce(null);
      await ps.canViewItemAsync(itemNoTrip, userId);
      expect(Attendee.findOne).toHaveBeenCalledTimes(1);
    });
  });

  // ─── canManageItemAsync ──────────────────────────────────────────────────────

  describe('canManageItemAsync', () => {
    const item = { id: 'item-1', userId: ownerId, createdBy: ownerId, itemType: 'hotel', tripId: 'trip-1' };

    it('returns true for owner', async () => {
      expect(await ps.canManageItemAsync(item, ownerId)).toBe(true);
    });

    it('returns true when item-level attendee has manage permission', async () => {
      Attendee.findOne.mockResolvedValueOnce({ id: 'att-1' });
      expect(await ps.canManageItemAsync(item, userId)).toBe(true);
    });

    it('returns true when trip-level attendee has manage permission', async () => {
      Attendee.findOne
        .mockResolvedValueOnce(null)          // item-level: no manage
        .mockResolvedValueOnce({ id: 'tt' }); // trip-level: yes manage
      expect(await ps.canManageItemAsync(item, userId)).toBe(true);
    });

    it('returns true when companion has manage_all permission', async () => {
      Attendee.findOne.mockResolvedValue(null);
      Companion.findOne.mockResolvedValueOnce({ id: 'comp-1' });
      expect(await ps.canManageItemAsync(item, userId)).toBe(true);
    });

    it('returns false for view-only companion', async () => {
      Attendee.findOne.mockResolvedValue(null);
      Companion.findOne.mockResolvedValueOnce(null); // manage_all query returns null
      expect(await ps.canManageItemAsync(item, userId)).toBe(false);
    });

    it('returns false when nothing matches', async () => {
      Attendee.findOne.mockResolvedValue(null);
      Companion.findOne.mockResolvedValueOnce(null);
      expect(await ps.canManageItemAsync(item, userId)).toBe(false);
    });
  });

  // ─── canManageTripAsync ──────────────────────────────────────────────────────

  describe('canManageTripAsync', () => {
    const trip = { id: 'trip-1', userId: ownerId, createdBy: ownerId };

    it('returns true for trip owner', async () => {
      expect(await ps.canManageTripAsync(trip, ownerId)).toBe(true);
    });

    it('returns true when trip attendee has manage permission', async () => {
      Attendee.findOne.mockResolvedValueOnce({ id: 'att-1' });
      expect(await ps.canManageTripAsync(trip, userId)).toBe(true);
      expect(Attendee.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId, itemType: 'trip', itemId: 'trip-1' }),
        })
      );
    });

    it('returns false when no manage attendee record', async () => {
      Attendee.findOne.mockResolvedValueOnce(null);
      expect(await ps.canManageTripAsync(trip, userId)).toBe(false);
    });

    it('returns false for null trip', async () => {
      expect(await ps.canManageTripAsync(null, userId)).toBe(false);
    });
  });

  // ─── canViewTripAsync ────────────────────────────────────────────────────────

  describe('canViewTripAsync', () => {
    const trip = { id: 'trip-1', userId: ownerId };

    it('returns true for trip owner', async () => {
      expect(await ps.canViewTripAsync(trip, ownerId)).toBe(true);
    });

    it('returns true when attendee record exists', async () => {
      Attendee.findOne.mockResolvedValueOnce({ id: 'att-1' });
      expect(await ps.canViewTripAsync(trip, userId)).toBe(true);
    });

    it('returns true when companion has view permission', async () => {
      Attendee.findOne.mockResolvedValueOnce(null);
      Companion.findOne.mockResolvedValueOnce({ id: 'comp-1' });
      expect(await ps.canViewTripAsync(trip, userId)).toBe(true);
    });

    it('returns true when companion has manage_all permission', async () => {
      Attendee.findOne.mockResolvedValueOnce(null);
      Companion.findOne.mockResolvedValueOnce({ id: 'comp-1' });
      expect(await ps.canViewTripAsync(trip, userId)).toBe(true);
    });

    it('returns false when no attendee and no companion', async () => {
      Attendee.findOne.mockResolvedValueOnce(null);
      Companion.findOne.mockResolvedValueOnce(null);
      expect(await ps.canViewTripAsync(trip, userId)).toBe(false);
    });

    it('returns false for null trip', async () => {
      expect(await ps.canViewTripAsync(null, userId)).toBe(false);
    });

    it('returns false for null userId', async () => {
      expect(await ps.canViewTripAsync(trip, null)).toBe(false);
    });
  });
});
