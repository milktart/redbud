/**
 * PermissionService Unit Tests
 *
 * Tests permission checking logic for items and trips.
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

const PermissionService = require('../../../services/PermissionService');

describe('PermissionService', () => {
  let permissionService;
  const ownerId = 'user-123';
  const otherId = 'user-456';

  beforeEach(() => {
    permissionService = new PermissionService();
  });

  describe('Item Permissions', () => {
    const mockItem = {
      id: 'item-1',
      userId: ownerId,
      name: 'Test Hotel',
    };

    describe('canViewItem', () => {
      it('should allow owner to view item', () => {
        expect(permissionService.canViewItem(mockItem, ownerId)).toBe(true);
      });

      it('should deny non-owner to view item', () => {
        expect(permissionService.canViewItem(mockItem, otherId)).toBe(false);
      });

      it('should return false for null item', () => {
        expect(permissionService.canViewItem(null, ownerId)).toBe(false);
      });

      it('should return false for null userId', () => {
        expect(permissionService.canViewItem(mockItem, null)).toBe(false);
      });
    });

    describe('canEditItem', () => {
      it('should allow owner to edit item', () => {
        expect(permissionService.canEditItem(mockItem, ownerId)).toBe(true);
      });

      it('should deny non-owner to edit item', () => {
        expect(permissionService.canEditItem(mockItem, otherId)).toBe(false);
      });

      it('should return false for null item', () => {
        expect(permissionService.canEditItem(null, ownerId)).toBe(false);
      });
    });

    describe('canDeleteItem', () => {
      it('should allow owner to delete item', () => {
        expect(permissionService.canDeleteItem(mockItem, ownerId)).toBe(true);
      });

      it('should deny non-owner to delete item', () => {
        expect(permissionService.canDeleteItem(mockItem, otherId)).toBe(false);
      });

      it('should return false for null item', () => {
        expect(permissionService.canDeleteItem(null, ownerId)).toBe(false);
      });
    });

    describe('getItemPermissions', () => {
      it('should return all permissions for owner', () => {
        const permissions = permissionService.getItemPermissions(mockItem, ownerId);

        expect(permissions).toEqual({
          canView: true,
          canEdit: true,
          canDelete: true,
          isOwner: true,
          isShared: false,
        });
      });

      it('should return no permissions for non-owner', () => {
        const permissions = permissionService.getItemPermissions(mockItem, otherId);

        expect(permissions).toEqual({
          canView: false,
          canEdit: false,
          canDelete: false,
          isOwner: false,
          isShared: false,
        });
      });
    });
  });

  describe('Trip Permissions', () => {
    const mockTrip = {
      id: 'trip-1',
      userId: ownerId,
      name: 'Test Trip',
    };

    describe('canViewTrip', () => {
      it('should allow owner to view trip', () => {
        expect(permissionService.canViewTrip(mockTrip, ownerId)).toBe(true);
      });

      it('should deny non-owner to view trip', () => {
        expect(permissionService.canViewTrip(mockTrip, otherId)).toBe(false);
      });

      it('should return false for null trip', () => {
        expect(permissionService.canViewTrip(null, ownerId)).toBe(false);
      });
    });

    describe('canEditTrip', () => {
      it('should allow owner to edit trip', () => {
        expect(permissionService.canEditTrip(mockTrip, ownerId)).toBe(true);
      });

      it('should deny non-owner to edit trip', () => {
        expect(permissionService.canEditTrip(mockTrip, otherId)).toBe(false);
      });
    });

    describe('canDeleteTrip', () => {
      it('should allow owner to delete trip', () => {
        expect(permissionService.canDeleteTrip(mockTrip, ownerId)).toBe(true);
      });

      it('should deny non-owner to delete trip', () => {
        expect(permissionService.canDeleteTrip(mockTrip, otherId)).toBe(false);
      });
    });

    describe('getTripPermissions', () => {
      it('should return all permissions for owner', () => {
        const permissions = permissionService.getTripPermissions(mockTrip, ownerId);

        expect(permissions).toEqual({
          canView: true,
          canEdit: true,
          canDelete: true,
          isOwner: true,
          isShared: false,
        });
      });

      it('should return no permissions for non-owner', () => {
        const permissions = permissionService.getTripPermissions(mockTrip, otherId);

        expect(permissions).toEqual({
          canView: false,
          canEdit: false,
          canDelete: false,
          isOwner: false,
          isShared: false,
        });
      });
    });
  });

  describe('Verification Methods', () => {
    const mockItem = {
      id: 'item-1',
      userId: ownerId,
      name: 'Test Item',
    };

    describe('verifyItemAccess', () => {
      it('should not throw for owner with view permission', async () => {
        await expect(
          permissionService.verifyItemAccess(mockItem, ownerId, 'view')
        ).resolves.not.toThrow();
      });

      it('should not throw for owner with edit permission', async () => {
        await expect(
          permissionService.verifyItemAccess(mockItem, ownerId, 'edit')
        ).resolves.not.toThrow();
      });

      it('should not throw for owner with delete permission', async () => {
        await expect(
          permissionService.verifyItemAccess(mockItem, ownerId, 'delete')
        ).resolves.not.toThrow();
      });

      it('should throw 403 for non-owner with view permission', async () => {
        await expect(permissionService.verifyItemAccess(mockItem, otherId, 'view')).rejects.toThrow(
          'Access denied'
        );

        try {
          await permissionService.verifyItemAccess(mockItem, otherId, 'view');
        } catch (error) {
          expect(error.statusCode).toBe(403);
        }
      });

      it('should throw 404 for null item', async () => {
        await expect(permissionService.verifyItemAccess(null, ownerId, 'view')).rejects.toThrow(
          'Item not found'
        );

        try {
          await permissionService.verifyItemAccess(null, ownerId, 'view');
        } catch (error) {
          expect(error.statusCode).toBe(404);
        }
      });

      it('should throw for invalid permission level', async () => {
        await expect(
          permissionService.verifyItemAccess(mockItem, ownerId, 'invalid')
        ).rejects.toThrow('Invalid permission level');
      });
    });

    describe('verifyTripAccess', () => {
      const mockTrip = {
        id: 'trip-1',
        userId: ownerId,
        name: 'Test Trip',
      };

      it('should not throw for owner with view permission', async () => {
        await expect(
          permissionService.verifyTripAccess(mockTrip, ownerId, 'view')
        ).resolves.not.toThrow();
      });

      it('should throw 403 for non-owner', async () => {
        await expect(permissionService.verifyTripAccess(mockTrip, otherId, 'view')).rejects.toThrow(
          'Access denied'
        );

        try {
          await permissionService.verifyTripAccess(mockTrip, otherId, 'view');
        } catch (error) {
          expect(error.statusCode).toBe(403);
        }
      });

      it('should throw 404 for null trip', async () => {
        await expect(permissionService.verifyTripAccess(null, ownerId, 'view')).rejects.toThrow(
          'Trip not found'
        );

        try {
          await permissionService.verifyTripAccess(null, ownerId, 'view');
        } catch (error) {
          expect(error.statusCode).toBe(404);
        }
      });
    });
  });
});
