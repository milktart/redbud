/**
 * AuthBusinessService Unit Tests
 *
 * Tests authentication business logic.
 */

// Create bcrypt mock
const mockBcrypt = {
  hash: jest.fn(),
  compare: jest.fn(),
};

// Mock dependencies before requiring the service
jest.doMock('bcrypt', () => mockBcrypt);
jest.mock('../../../models');

const AuthBusinessService = require('../../../services/business/AuthBusinessService');
const { User } = require('../../../models');

// Set up model mocks
User.findOne = jest.fn();
User.create = jest.fn();

describe('AuthBusinessService', () => {
  let authService;

  beforeEach(() => {
    authService = new AuthBusinessService();
    jest.clearAllMocks();
  });

  describe('registerUser', () => {
    const validUserData = {
      email: 'TEST@EXAMPLE.COM',
      password: 'password123',
      firstName: 'John',
      lastName: 'D',
    };

    it('should register a new user with normalized email', async () => {
      User.findOne.mockResolvedValue(null); // No existing user
      mockBcrypt.hash.mockResolvedValue('hashed_password');

      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'D',
        isAdmin: false,
        createdAt: new Date(),
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

      const result = await authService.registerUser(validUserData);

      // Email should be lowercased
      expect(User.findOne).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });

      expect(mockBcrypt.hash).toHaveBeenCalledWith('password123', 10);

      expect(User.create).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'hashed_password',
        firstName: 'John',
        lastName: 'D',
        isAdmin: false,
        linkedAt: expect.any(Date),
      });

      expect(result).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'D',
        isAdmin: false,
        createdAt: expect.any(Date),
        lastLogin: undefined,
      });

      // Password should be removed
      expect(result.password).toBeUndefined();
    });

    it('should throw error if email already exists', async () => {
      User.findOne.mockResolvedValue({ id: 'existing-user' });

      await expect(authService.registerUser(validUserData)).rejects.toThrow(
        'Email already registered'
      );

      expect(User.create).not.toHaveBeenCalled();
    });

    it('should throw error if email is missing', async () => {
      const invalidData = { ...validUserData, email: '' };

      await expect(authService.registerUser(invalidData)).rejects.toThrow(
        'Email and password are required'
      );
    });

    it('should throw error if password is missing', async () => {
      const invalidData = { ...validUserData, password: '' };

      await expect(authService.registerUser(invalidData)).rejects.toThrow(
        'Email and password are required'
      );
    });

    it('should support name field (split into first/last)', async () => {
      User.findOne.mockResolvedValue(null);
      mockBcrypt.hash.mockResolvedValue('hashed_password');

      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        toJSON: () => ({
          id: 'user-123',
          email: 'test@example.com',
          firstName: 'John',
          lastName: 'Doe',
        }),
      };

      User.create.mockResolvedValue(mockUser);

      const userData = {
        email: 'test@example.com',
        password: 'password123',
        name: 'John Doe',
      };

      await authService.registerUser(userData);

      expect(User.create).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: 'John',
          lastName: 'Doe',
        })
      );
    });

    it('should set isAdmin true for ADMIN_EMAIL', async () => {
      process.env.ADMIN_EMAIL = 'admin@example.com';

      User.findOne.mockResolvedValue(null);
      mockBcrypt.hash.mockResolvedValue('hashed_password');

      const mockUser = {
        id: 'admin-123',
        email: 'admin@example.com',
        firstName: 'Admin',
        lastName: 'U',
        isAdmin: true,
        toJSON: () => ({
          id: 'admin-123',
          email: 'admin@example.com',
          isAdmin: true,
        }),
      };

      User.create.mockResolvedValue(mockUser);

      const userData = {
        email: 'ADMIN@EXAMPLE.COM',
        password: 'password123',
        firstName: 'Admin',
        lastName: 'U',
      };

      await authService.registerUser(userData);

      expect(User.create).toHaveBeenCalledWith(
        expect.objectContaining({
          isAdmin: true,
        })
      );

      delete process.env.ADMIN_EMAIL;
    });
  });

  describe('validateRegistrationData', () => {
    it('should validate correct data', () => {
      const result = authService.validateRegistrationData({
        email: 'test@example.com',
        password: 'password123',
        firstName: 'John',
        lastName: 'D',
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject missing email', () => {
      const result = authService.validateRegistrationData({
        password: 'password123',
        firstName: 'John',
        lastName: 'D',
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Email is required');
    });

    it('should reject invalid email format', () => {
      const result = authService.validateRegistrationData({
        email: 'invalid-email',
        password: 'password123',
        firstName: 'John',
        lastName: 'D',
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid email format');
    });

    it('should reject short password', () => {
      const result = authService.validateRegistrationData({
        email: 'test@example.com',
        password: '12345',
        firstName: 'John',
        lastName: 'D',
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must be at least 6 characters');
    });

    it('should reject missing first/last name', () => {
      const result = authService.validateRegistrationData({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('First name and last name are required');
    });

    it('should reject multi-character last name', () => {
      const result = authService.validateRegistrationData({
        email: 'test@example.com',
        password: 'password123',
        firstName: 'John',
        lastName: 'Doe',
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Last name must be a single character (initial)');
    });
  });

  describe('isEmailRegistered', () => {
    it('should return true if email exists', async () => {
      User.findOne.mockResolvedValue({ id: 'user-123' });

      const result = await authService.isEmailRegistered('test@example.com');

      expect(result).toBe(true);
      expect(User.findOne).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
    });

    it('should return false if email does not exist', async () => {
      User.findOne.mockResolvedValue(null);

      const result = await authService.isEmailRegistered('test@example.com');

      expect(result).toBe(false);
    });

    it('should normalize email to lowercase', async () => {
      User.findOne.mockResolvedValue(null);

      await authService.isEmailRegistered('TEST@EXAMPLE.COM');

      expect(User.findOne).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
    });
  });

  describe('getUserByEmail', () => {
    it('should return user if found', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'D',
        password: 'hashed_password',
        toJSON: () => ({
          id: 'user-123',
          email: 'test@example.com',
          firstName: 'John',
          lastName: 'D',
          password: 'hashed_password',
        }),
      };

      User.findOne.mockResolvedValue(mockUser);

      const result = await authService.getUserByEmail('test@example.com');

      expect(result).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'D',
        isAdmin: undefined,
        createdAt: undefined,
        lastLogin: undefined,
      });

      // Password should be removed
      expect(result.password).toBeUndefined();
    });

    it('should return null if user not found', async () => {
      User.findOne.mockResolvedValue(null);

      const result = await authService.getUserByEmail('test@example.com');

      expect(result).toBeNull();
    });
  });

  describe('verifyUserPassword', () => {
    it('should return user if password is valid', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        password: 'hashed_password',
        lastLogin: null,
        save: jest.fn(),
        toJSON: () => ({
          id: 'user-123',
          email: 'test@example.com',
          password: 'hashed_password',
        }),
      };

      User.findOne.mockResolvedValue(mockUser);
      mockBcrypt.compare.mockResolvedValue(true);

      const result = await authService.verifyUserPassword('test@example.com', 'password123');

      expect(mockBcrypt.compare).toHaveBeenCalledWith('password123', 'hashed_password');
      expect(mockUser.save).toHaveBeenCalled();
      expect(mockUser.lastLogin).toBeInstanceOf(Date);
      expect(result).toMatchObject({
        id: 'user-123',
        email: 'test@example.com',
      });
      expect(result.password).toBeUndefined();
    });

    it('should return null if user not found', async () => {
      User.findOne.mockResolvedValue(null);

      const result = await authService.verifyUserPassword('test@example.com', 'password123');

      expect(result).toBeNull();
    });

    it('should return null if password is invalid', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        password: 'hashed_password',
      };

      User.findOne.mockResolvedValue(mockUser);
      mockBcrypt.compare.mockResolvedValue(false);

      const result = await authService.verifyUserPassword('test@example.com', 'wrong_password');

      expect(result).toBeNull();
    });
  });

  describe('sanitizeUserForResponse', () => {
    it('should remove password from user object', () => {
      const user = {
        id: 'user-123',
        email: 'test@example.com',
        password: 'hashed_password',
        firstName: 'John',
        lastName: 'D',
        toJSON: () => ({
          id: 'user-123',
          email: 'test@example.com',
          password: 'hashed_password',
          firstName: 'John',
          lastName: 'D',
        }),
      };

      const result = authService.sanitizeUserForResponse(user);

      expect(result.password).toBeUndefined();
      expect(result).toMatchObject({
        id: 'user-123',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'D',
      });
    });

    it('should handle plain objects without toJSON', () => {
      const user = {
        id: 'user-123',
        email: 'test@example.com',
        password: 'hashed_password',
      };

      const result = authService.sanitizeUserForResponse(user);

      expect(result.password).toBeUndefined();
    });
  });
});
