/**
 * UserBusinessService Unit Tests
 *
 * Tests user management business logic.
 */

// Create bcrypt mock
const mockBcrypt = {
  hash: jest.fn(),
  compare: jest.fn(),
};

// Mock dependencies before requiring the service
jest.doMock('bcrypt', () => mockBcrypt);
jest.mock('../../../models');

const UserBusinessService = require('../../../services/business/UserBusinessService');
const { User } = require('../../../models');
const { Op } = require('sequelize');

// Set up model mocks
User.findAll = jest.fn();
User.findOne = jest.fn();
User.findByPk = jest.fn();
User.create = jest.fn();
User.count = jest.fn();

describe('UserBusinessService', () => {
  let userService;

  beforeEach(() => {
    userService = new UserBusinessService();
    jest.clearAllMocks();
  });

  describe('getAllUsers', () => {
    it('should return all active users', async () => {
      const mockUsers = [
        {
          id: 'user-1',
          email: 'user1@example.com',
          toJSON: () => ({ id: 'user-1', email: 'user1@example.com' }),
        },
        {
          id: 'user-2',
          email: 'user2@example.com',
          toJSON: () => ({ id: 'user-2', email: 'user2@example.com' }),
        },
      ];

      User.findAll.mockResolvedValue(mockUsers);

      const result = await userService.getAllUsers();

      expect(User.findAll).toHaveBeenCalledWith({
        where: { isActive: true },
        attributes: ['id', 'email', 'firstName', 'lastName', 'isAdmin', 'lastLogin', 'createdAt'],
        order: [['createdAt', 'DESC']],
      });

      expect(result).toHaveLength(2);
    });

    it('should include inactive users when requested', async () => {
      User.findAll.mockResolvedValue([]);

      await userService.getAllUsers({ includeInactive: true });

      expect(User.findAll).toHaveBeenCalledWith({
        where: {},
        attributes: expect.any(Array),
        order: expect.any(Array),
      });
    });

    it('should support custom ordering', async () => {
      User.findAll.mockResolvedValue([]);

      await userService.getAllUsers({ orderBy: 'email', orderDir: 'ASC' });

      expect(User.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          order: [['email', 'ASC']],
        })
      );
    });
  });

  describe('createUser', () => {
    const validUserData = {
      email: 'TEST@EXAMPLE.COM',
      firstName: 'John',
      lastName: 'D',
      password: 'password123',
      isAdmin: false,
    };

    it('should create a new user with normalized email', async () => {
      User.findOne.mockResolvedValue(null); // No existing user
      mockBcrypt.hash.mockResolvedValue('hashed_password');

      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'D',
        isAdmin: false,
        toJSON: () => ({
          id: 'user-123',
          email: 'test@example.com',
          firstName: 'John',
          lastName: 'D',
          isAdmin: false,
          password: 'hashed_password',
        }),
      };

      User.create.mockResolvedValue(mockUser);

      const result = await userService.createUser(validUserData);

      expect(User.findOne).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });

      expect(mockBcrypt.hash).toHaveBeenCalledWith('password123', 10);

      expect(User.create).toHaveBeenCalledWith({
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'D',
        password: 'hashed_password',
        isAdmin: false,
        isActive: true,
      });

      expect(result.password).toBeUndefined();
    });

    it('should throw error if email already exists', async () => {
      User.findOne.mockResolvedValue({ id: 'existing-user' });

      await expect(userService.createUser(validUserData)).rejects.toThrow(
        'Email already registered'
      );
    });

    it('should throw error for invalid email', async () => {
      const invalidData = { ...validUserData, email: 'invalid-email' };

      await expect(userService.createUser(invalidData)).rejects.toThrow('Invalid email format');
    });

    it('should throw error for multi-character last name', async () => {
      const invalidData = { ...validUserData, lastName: 'Doe' };

      await expect(userService.createUser(invalidData)).rejects.toThrow(
        'Last name must be a single character'
      );
    });

    it('should create admin user when isAdmin is true', async () => {
      User.findOne.mockResolvedValue(null);
      mockBcrypt.hash.mockResolvedValue('hashed_password');

      const mockUser = {
        id: 'admin-123',
        email: 'admin@example.com',
        isAdmin: true,
        toJSON: () => ({ id: 'admin-123', isAdmin: true }),
      };

      User.create.mockResolvedValue(mockUser);

      await userService.createUser({ ...validUserData, isAdmin: true });

      expect(User.create).toHaveBeenCalledWith(
        expect.objectContaining({
          isAdmin: true,
        })
      );
    });
  });

  describe('updateUser', () => {
    it('should update user fields', async () => {
      const mockUser = {
        id: 'user-123',
        firstName: 'John',
        lastName: 'D',
        isAdmin: false,
        save: jest.fn(),
        toJSON: () => ({ id: 'user-123', firstName: 'Jane', lastName: 'S' }),
      };

      User.findByPk.mockResolvedValue(mockUser);

      const result = await userService.updateUser('user-123', {
        firstName: 'Jane',
        lastName: 'S',
      });

      expect(mockUser.firstName).toBe('Jane');
      expect(mockUser.lastName).toBe('S');
      expect(mockUser.save).toHaveBeenCalled();
      expect(result.password).toBeUndefined();
    });

    it('should throw error if user not found', async () => {
      User.findByPk.mockResolvedValue(null);

      await expect(userService.updateUser('user-123', {})).rejects.toThrow('User not found');
    });

    it('should hash password when updating', async () => {
      const mockUser = {
        id: 'user-123',
        password: 'old_hash',
        save: jest.fn(),
        toJSON: () => ({ id: 'user-123' }),
      };

      User.findByPk.mockResolvedValue(mockUser);
      mockBcrypt.hash.mockResolvedValue('new_hash');

      await userService.updateUser('user-123', { password: 'newpassword123' });

      expect(mockBcrypt.hash).toHaveBeenCalledWith('newpassword123', 10);
      expect(mockUser.password).toBe('new_hash');
    });

    it('should throw error for short password', async () => {
      const mockUser = {
        id: 'user-123',
        save: jest.fn(),
      };

      User.findByPk.mockResolvedValue(mockUser);

      await expect(userService.updateUser('user-123', { password: '12345' })).rejects.toThrow(
        'Password must be at least 6 characters'
      );
    });

    it('should throw error for invalid last name', async () => {
      const mockUser = {
        id: 'user-123',
        save: jest.fn(),
      };

      User.findByPk.mockResolvedValue(mockUser);

      await expect(userService.updateUser('user-123', { lastName: 'Doe' })).rejects.toThrow(
        'Last name must be a single character'
      );
    });
  });

  describe('deactivateUser', () => {
    it('should deactivate a user', async () => {
      const mockUser = {
        id: 'user-123',
        isActive: true,
        save: jest.fn(),
        toJSON: () => ({ id: 'user-123', isActive: false }),
      };

      User.findByPk.mockResolvedValue(mockUser);

      await userService.deactivateUser('user-123', 'admin-456');

      expect(mockUser.isActive).toBe(false);
      expect(mockUser.save).toHaveBeenCalled();
    });

    it('should throw error when deactivating own account', async () => {
      await expect(userService.deactivateUser('user-123', 'user-123')).rejects.toThrow(
        'You cannot deactivate your own account'
      );
    });

    it('should throw error if user not found', async () => {
      User.findByPk.mockResolvedValue(null);

      await expect(userService.deactivateUser('user-123', 'admin-456')).rejects.toThrow(
        'User not found'
      );
    });
  });

  describe('getUserById', () => {
    it('should return user by ID', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        toJSON: () => ({ id: 'user-123', email: 'test@example.com' }),
      };

      User.findOne.mockResolvedValue(mockUser);

      const result = await userService.getUserById('user-123');

      expect(User.findOne).toHaveBeenCalledWith({
        where: { id: 'user-123', isActive: true },
        attributes: expect.any(Array),
      });

      expect(result).toMatchObject({ id: 'user-123', email: 'test@example.com' });
    });

    it('should throw error if user not found', async () => {
      User.findOne.mockResolvedValue(null);

      await expect(userService.getUserById('user-123')).rejects.toThrow('User not found');
    });

    it('should include inactive users when requested', async () => {
      const mockUser = {
        id: 'user-123',
        isActive: false,
        toJSON: () => ({ id: 'user-123', isActive: false }),
      };

      User.findOne.mockResolvedValue(mockUser);

      await userService.getUserById('user-123', true);

      expect(User.findOne).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        attributes: expect.any(Array),
      });
    });
  });

  describe('searchUsersByEmail', () => {
    it('should search users by email', async () => {
      const mockUsers = [
        {
          id: 'user-1',
          email: 'john@example.com',
          toJSON: () => ({ id: 'user-1', email: 'john@example.com' }),
        },
        {
          id: 'user-2',
          email: 'johnny@example.com',
          toJSON: () => ({ id: 'user-2', email: 'johnny@example.com' }),
        },
      ];

      User.findAll.mockResolvedValue(mockUsers);

      const result = await userService.searchUsersByEmail('john');

      expect(User.findAll).toHaveBeenCalledWith({
        where: {
          email: { [Op.iLike]: '%john%' },
          isActive: true,
        },
        attributes: ['id', 'email', 'firstName', 'lastName'],
        limit: 10,
        order: [['email', 'ASC']],
      });

      expect(result).toHaveLength(2);
    });

    it('should throw error for empty search term', async () => {
      await expect(userService.searchUsersByEmail('')).rejects.toThrow(
        'Email search parameter is required'
      );

      await expect(userService.searchUsersByEmail('   ')).rejects.toThrow(
        'Email search parameter is required'
      );
    });

    it('should normalize search term to lowercase', async () => {
      User.findAll.mockResolvedValue([]);

      await userService.searchUsersByEmail('JOHN@EXAMPLE.COM');

      expect(User.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            email: { [Op.iLike]: '%john@example.com%' },
          }),
        })
      );
    });

    it('should support custom limit', async () => {
      User.findAll.mockResolvedValue([]);

      await userService.searchUsersByEmail('john', { limit: 5 });

      expect(User.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 5,
        })
      );
    });
  });

  describe('getUserByEmail', () => {
    it('should return user by email', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        toJSON: () => ({ id: 'user-123', email: 'test@example.com' }),
      };

      User.findOne.mockResolvedValue(mockUser);

      const result = await userService.getUserByEmail('TEST@EXAMPLE.COM');

      expect(User.findOne).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
        attributes: expect.any(Array),
      });

      expect(result).toMatchObject({ id: 'user-123', email: 'test@example.com' });
    });

    it('should return null if user not found', async () => {
      User.findOne.mockResolvedValue(null);

      const result = await userService.getUserByEmail('test@example.com');

      expect(result).toBeNull();
    });
  });

  describe('userExists', () => {
    it('should return true if user exists', async () => {
      User.count.mockResolvedValue(1);

      const result = await userService.userExists('user-123');

      expect(result).toBe(true);
      expect(User.count).toHaveBeenCalledWith({
        where: { id: 'user-123', isActive: true },
      });
    });

    it('should return false if user does not exist', async () => {
      User.count.mockResolvedValue(0);

      const result = await userService.userExists('user-123');

      expect(result).toBe(false);
    });
  });

  describe('getUserStatistics', () => {
    it('should return user statistics', async () => {
      User.count
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(90) // active
        .mockResolvedValueOnce(10) // inactive
        .mockResolvedValueOnce(5); // admin

      const result = await userService.getUserStatistics();

      expect(result).toEqual({
        totalUsers: 100,
        activeUsers: 90,
        inactiveUsers: 10,
        adminUsers: 5,
      });
    });
  });

  describe('validateUserData', () => {
    it('should validate correct data', () => {
      const result = userService.validateUserData({
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'D',
        password: 'password123',
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject invalid email', () => {
      const result = userService.validateUserData({
        email: 'invalid',
        firstName: 'John',
        lastName: 'D',
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid email format');
    });

    it('should reject missing first name', () => {
      const result = userService.validateUserData({
        email: 'test@example.com',
        firstName: '',
        lastName: 'D',
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('First name is required');
    });

    it('should reject multi-character last name', () => {
      const result = userService.validateUserData({
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Last name must be a single character (initial)');
    });

    it('should reject short password', () => {
      const result = userService.validateUserData({
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'D',
        password: '12345',
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must be at least 6 characters');
    });
  });

  describe('reactivateUser', () => {
    it('should reactivate an inactive user', async () => {
      const mockUser = {
        id: 'user-123',
        isActive: false,
        save: jest.fn(),
        toJSON: () => ({ id: 'user-123', isActive: true }),
      };

      User.findByPk.mockResolvedValue(mockUser);

      const result = await userService.reactivateUser('user-123');

      expect(mockUser.isActive).toBe(true);
      expect(mockUser.save).toHaveBeenCalled();
      expect(result.isActive).toBe(true);
    });

    it('should throw error if user not found', async () => {
      User.findByPk.mockResolvedValue(null);

      await expect(userService.reactivateUser('user-123')).rejects.toThrow('User not found');
    });
  });
});
