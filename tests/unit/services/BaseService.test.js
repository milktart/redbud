const BaseService = require('../../../services/BaseService');

// Mock Sequelize model
const createMockModel = () => ({
  findAll: jest.fn(),
  findByPk: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  destroy: jest.fn(),
  count: jest.fn(),
});

describe('BaseService', () => {
  let mockModel;
  let service;

  beforeEach(() => {
    mockModel = createMockModel();
    service = new BaseService(mockModel, 'TestModel');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should find all records', async () => {
      const mockRecords = [{ id: 1 }, { id: 2 }];
      mockModel.findAll.mockResolvedValue(mockRecords);

      const result = await service.findAll();

      expect(mockModel.findAll).toHaveBeenCalledWith({ where: {} });
      expect(result).toEqual(mockRecords);
    });

    it('should pass where clause and options to model', async () => {
      mockModel.findAll.mockResolvedValue([]);

      await service.findAll({ active: true }, { limit: 10 });

      expect(mockModel.findAll).toHaveBeenCalledWith({
        where: { active: true },
        limit: 10,
      });
    });
  });

  describe('findById', () => {
    it('should find record by primary key', async () => {
      const mockRecord = { id: 1, name: 'Test' };
      mockModel.findByPk.mockResolvedValue(mockRecord);

      const result = await service.findById(1);

      expect(mockModel.findByPk).toHaveBeenCalledWith(1, {});
      expect(result).toEqual(mockRecord);
    });

    it('should pass options to findByPk', async () => {
      mockModel.findByPk.mockResolvedValue(null);

      await service.findById(1, { include: ['association'] });

      expect(mockModel.findByPk).toHaveBeenCalledWith(1, { include: ['association'] });
    });
  });

  describe('findOne', () => {
    it('should find one record matching criteria', async () => {
      const mockRecord = { id: 1, email: 'test@example.com' };
      mockModel.findOne.mockResolvedValue(mockRecord);

      const result = await service.findOne({ email: 'test@example.com' });

      expect(mockModel.findOne).toHaveBeenCalledWith({ where: { email: 'test@example.com' } });
      expect(result).toEqual(mockRecord);
    });
  });

  describe('create', () => {
    it('should create a new record', async () => {
      const newData = { name: 'New Record' };
      const mockCreated = { id: 1, ...newData };
      mockModel.create.mockResolvedValue(mockCreated);

      const result = await service.create(newData);

      expect(mockModel.create).toHaveBeenCalledWith(newData, {});
      expect(result).toEqual(mockCreated);
    });
  });

  describe('update', () => {
    it('should update an existing record', async () => {
      const mockInstance = {
        id: 1,
        name: 'Old Name',
        update: jest.fn().mockResolvedValue(undefined),
      };

      const result = await service.update(mockInstance, { name: 'New Name' });

      expect(mockInstance.update).toHaveBeenCalledWith({ name: 'New Name' });
      // Source returns the record instance itself, not the update result
      expect(result).toBe(mockInstance);
    });
  });

  describe('delete', () => {
    it('should delete a record', async () => {
      const mockInstance = {
        id: 1,
        destroy: jest.fn().mockResolvedValue(undefined),
      };

      await service.delete(mockInstance);

      expect(mockInstance.destroy).toHaveBeenCalled();
    });
  });

  describe('count', () => {
    it('should count records', async () => {
      mockModel.count.mockResolvedValue(42);

      const result = await service.count({ active: true });

      expect(mockModel.count).toHaveBeenCalledWith({ where: { active: true } });
      expect(result).toBe(42);
    });
  });

  describe('findByIdAndVerifyOwnership', () => {
    it('should find record and verify ownership', async () => {
      const mockRecord = { id: 1, userId: 'user-123' };
      mockModel.findByPk.mockResolvedValue(mockRecord);

      const result = await service.findByIdAndVerifyOwnership(1, 'user-123');

      expect(result).toEqual(mockRecord);
    });

    it('should return null if record not found', async () => {
      mockModel.findByPk.mockResolvedValue(null);

      const result = await service.findByIdAndVerifyOwnership(1, 'user-123');

      expect(result).toBeNull();
    });

    it('should return null if user does not own record', async () => {
      const mockRecord = { id: 1, userId: 'user-456' };
      mockModel.findByPk.mockResolvedValue(mockRecord);

      const result = await service.findByIdAndVerifyOwnership(1, 'user-123');

      expect(result).toBeNull();
    });
  });
});
