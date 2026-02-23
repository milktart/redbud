/**
 * TripDataService Unit Tests
 *
 * Covers getCompanionSharedTrips — the new method added for friends-trips support.
 * Mocks Companion and Trip models to avoid DB dependency.
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
  Trip: { findAll: jest.fn(), findOne: jest.fn(), count: jest.fn(), create: jest.fn() },
  Flight: {},
  Hotel: {},
  Transportation: {},
  CarRental: {},
  Event: {},
  Attendee: { findAll: jest.fn(), create: jest.fn() },
  Companion: { findAll: jest.fn() },
  User: {},
}));

const { Companion, Trip } = require('../../../models');
const TripDataService = require('../../../services/TripDataService');

describe('TripDataService.getCompanionSharedTrips', () => {
  let service;
  const userId = 'user-me';
  const friendId = 'user-friend';

  beforeEach(() => {
    service = new TripDataService();
    jest.clearAllMocks();
    // getTripIncludes returns an array; mock it to return []
    jest.spyOn(service, 'getTripIncludes').mockReturnValue([]);
  });

  it('returns empty array when user has no companion relationships', async () => {
    Companion.findAll.mockResolvedValueOnce([]);
    const result = await service.getCompanionSharedTrips(userId);
    expect(result).toEqual([]);
    expect(Trip.findAll).not.toHaveBeenCalled();
  });

  it('queries companions where companionUserId === userId with view or manage_all', async () => {
    Companion.findAll.mockResolvedValueOnce([]);
    await service.getCompanionSharedTrips(userId);
    expect(Companion.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ companionUserId: userId }),
      })
    );
  });

  it('returns trips owned by companions who granted view access', async () => {
    Companion.findAll.mockResolvedValueOnce([{ userId: friendId }]);
    const mockTrips = [
      { id: 'trip-1', userId: friendId, departureDate: '2026-06-01' },
    ];
    Trip.findAll.mockResolvedValueOnce(mockTrips);

    const result = await service.getCompanionSharedTrips(userId);
    expect(result).toEqual(mockTrips);
    // Trip.findAll called with a where.userId that contains Op.in with the friend's id
    const [[callArgs]] = Trip.findAll.mock.calls;
    const userIdClause = callArgs.where.userId;
    const inKey = Object.getOwnPropertySymbols(userIdClause).find((s) => s.toString().includes('in'));
    expect(inKey).toBeDefined();
    expect(userIdClause[inKey]).toEqual([friendId]);
  });

  it('excludes the requesting user\'s own trips from the result', async () => {
    Companion.findAll.mockResolvedValueOnce([{ userId: friendId }, { userId }]);
    Trip.findAll.mockResolvedValueOnce([]);

    await service.getCompanionSharedTrips(userId);

    // The Trip.findAll where clause should contain Op.ne: userId
    const [[callArgs]] = Trip.findAll.mock.calls;
    const userIdClause = callArgs.where.userId;
    const neKey = Object.getOwnPropertySymbols(userIdClause).find((s) => s.toString().includes('ne'));
    expect(neKey).toBeDefined();
    expect(userIdClause[neKey]).toBe(userId);
  });

  it('passes dateFilter and orderDirection to Trip.findAll', async () => {
    Companion.findAll.mockResolvedValueOnce([{ userId: friendId }]);
    Trip.findAll.mockResolvedValueOnce([]);

    const dateFilter = { departureDate: { $gte: new Date('2026-01-01') } };
    await service.getCompanionSharedTrips(userId, { dateFilter, orderDirection: 'DESC' });

    expect(Trip.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        order: [['departureDate', 'DESC']],
        where: expect.objectContaining(dateFilter),
      })
    );
  });

  it('defaults orderDirection to ASC', async () => {
    Companion.findAll.mockResolvedValueOnce([{ userId: friendId }]);
    Trip.findAll.mockResolvedValueOnce([]);

    await service.getCompanionSharedTrips(userId);
    expect(Trip.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ order: [['departureDate', 'ASC']] })
    );
  });
});
