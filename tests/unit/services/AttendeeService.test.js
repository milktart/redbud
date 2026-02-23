/**
 * AttendeeService Unit Tests
 *
 * Focuses on canView/canManage with tripId fallback (new behaviour).
 * Mocks Attendee model and CompanionService to avoid DB dependency.
 */

jest.mock('../../../models', () => ({
  Attendee: { findOne: jest.fn(), findAll: jest.fn(), create: jest.fn(), destroy: jest.fn() },
  User: {},
  Trip: { findByPk: jest.fn() },
  Flight: {},
  Hotel: {},
  Event: {},
  Transportation: {},
  CarRental: {},
}));

jest.mock('../../../services/CompanionService', () => {
  return jest.fn().mockImplementation(() => ({
    canViewAllItems: jest.fn().mockResolvedValue(false),
    canManageAllItems: jest.fn().mockResolvedValue(false),
  }));
});

const { Attendee } = require('../../../models');
const CompanionService = require('../../../services/CompanionService');
const AttendeeService = require('../../../services/AttendeeService');

describe('AttendeeService', () => {
  let service;
  const createdBy = 'user-creator';
  const userId = 'user-other';
  const itemId = 'item-1';
  const tripId = 'trip-1';

  beforeEach(() => {
    service = new AttendeeService();
    jest.clearAllMocks();
  });

  // ─── canView ────────────────────────────────────────────────────────────────

  describe('canView', () => {
    it('returns true when userId === createdBy', async () => {
      expect(await service.canView('flight', itemId, createdBy, createdBy)).toBe(true);
      expect(Attendee.findOne).not.toHaveBeenCalled();
    });

    it('returns true when item-level attendee record exists', async () => {
      Attendee.findOne.mockResolvedValueOnce({ id: 'att-1' });
      expect(await service.canView('flight', itemId, userId, createdBy)).toBe(true);
    });

    it('returns true when trip-level attendee record exists (tripId fallback)', async () => {
      Attendee.findOne
        .mockResolvedValueOnce(null)         // item-level: no
        .mockResolvedValueOnce({ id: 'tt' }); // trip-level: yes
      expect(await service.canView('flight', itemId, userId, createdBy, tripId)).toBe(true);
      expect(Attendee.findOne).toHaveBeenCalledTimes(2);
      // Second call should check trip-level record
      expect(Attendee.findOne).toHaveBeenNthCalledWith(2,
        expect.objectContaining({
          where: expect.objectContaining({ userId, itemType: 'trip', itemId: tripId }),
        })
      );
    });

    it('does NOT check trip-level when itemType is trip', async () => {
      Attendee.findOne.mockResolvedValueOnce(null);
      service.companionService.canViewAllItems.mockResolvedValueOnce(false);
      await service.canView('trip', tripId, userId, createdBy, tripId);
      expect(Attendee.findOne).toHaveBeenCalledTimes(1);
    });

    it('does NOT check trip-level when tripId is null', async () => {
      Attendee.findOne.mockResolvedValueOnce(null);
      service.companionService.canViewAllItems.mockResolvedValueOnce(false);
      await service.canView('flight', itemId, userId, createdBy, null);
      expect(Attendee.findOne).toHaveBeenCalledTimes(1);
    });

    it('falls through to companion check when no attendee records', async () => {
      Attendee.findOne.mockResolvedValue(null);
      service.companionService.canViewAllItems.mockResolvedValueOnce(true);
      expect(await service.canView('flight', itemId, userId, createdBy, tripId)).toBe(true);
      expect(service.companionService.canViewAllItems).toHaveBeenCalledWith(userId, createdBy);
    });

    it('returns false when nothing matches', async () => {
      Attendee.findOne.mockResolvedValue(null);
      service.companionService.canViewAllItems.mockResolvedValueOnce(false);
      expect(await service.canView('flight', itemId, userId, createdBy, tripId)).toBe(false);
    });
  });

  // ─── canManage ───────────────────────────────────────────────────────────────

  describe('canManage', () => {
    it('returns true when userId === createdBy', async () => {
      expect(await service.canManage('flight', itemId, createdBy, createdBy)).toBe(true);
      expect(Attendee.findOne).not.toHaveBeenCalled();
    });

    it('returns true when item-level attendee has manage permission', async () => {
      Attendee.findOne.mockResolvedValueOnce({ permissionLevel: 'manage' });
      expect(await service.canManage('flight', itemId, userId, createdBy)).toBe(true);
    });

    it('returns false when item-level attendee has only view permission', async () => {
      Attendee.findOne
        .mockResolvedValueOnce({ permissionLevel: 'view' }) // item-level: view only
        .mockResolvedValueOnce(null);                        // trip-level: none
      service.companionService.canManageAllItems.mockResolvedValueOnce(false);
      expect(await service.canManage('flight', itemId, userId, createdBy, tripId)).toBe(false);
    });

    it('returns true when trip-level attendee has manage permission (tripId fallback)', async () => {
      Attendee.findOne
        .mockResolvedValueOnce(null)          // item-level: no manage record
        .mockResolvedValueOnce({ id: 'tt' }); // trip-level: manage yes
      expect(await service.canManage('flight', itemId, userId, createdBy, tripId)).toBe(true);
      expect(Attendee.findOne).toHaveBeenCalledTimes(2);
      expect(Attendee.findOne).toHaveBeenNthCalledWith(2,
        expect.objectContaining({
          where: expect.objectContaining({
            userId, itemType: 'trip', itemId: tripId, permissionLevel: 'manage',
          }),
        })
      );
    });

    it('does NOT check trip-level when itemType is trip', async () => {
      Attendee.findOne.mockResolvedValueOnce(null);
      service.companionService.canManageAllItems.mockResolvedValueOnce(false);
      await service.canManage('trip', tripId, userId, createdBy, tripId);
      expect(Attendee.findOne).toHaveBeenCalledTimes(1);
    });

    it('falls through to companion check when no attendee records', async () => {
      Attendee.findOne.mockResolvedValue(null);
      service.companionService.canManageAllItems.mockResolvedValueOnce(true);
      expect(await service.canManage('flight', itemId, userId, createdBy, tripId)).toBe(true);
      expect(service.companionService.canManageAllItems).toHaveBeenCalledWith(userId, createdBy);
    });

    it('returns false when nothing matches', async () => {
      Attendee.findOne.mockResolvedValue(null);
      service.companionService.canManageAllItems.mockResolvedValueOnce(false);
      expect(await service.canManage('flight', itemId, userId, createdBy, tripId)).toBe(false);
    });

    it('existing callers without tripId still work (default null)', async () => {
      Attendee.findOne.mockResolvedValueOnce({ permissionLevel: 'manage' });
      // No tripId passed — should still work via item-level attendee
      expect(await service.canManage('flight', itemId, userId, createdBy)).toBe(true);
    });
  });
});
