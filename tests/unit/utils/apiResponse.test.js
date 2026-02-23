const {
  success,
  error,
  paginated,
  created,
  noContent,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  internalError,
} = require('../../../utils/apiResponse');

// Mock logger to suppress output
jest.mock('../../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

// Helper to create a mock Express response
function createMockRes() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  };
  return res;
}

describe('API Response Utilities', () => {
  let res;

  beforeEach(() => {
    res = createMockRes();
  });

  describe('success', () => {
    it('should create a success response with data', () => {
      const data = { id: 1, name: 'Test' };
      success(res, data);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Success',
        data: { id: 1, name: 'Test' },
      });
    });

    it('should create a success response with message', () => {
      success(res, { id: 1 }, 'Operation completed');

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { id: 1 },
        message: 'Operation completed',
      });
    });

    it('should handle null data', () => {
      success(res, null);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: null,
        message: 'Success',
      });
    });

    it('should accept custom status code', () => {
      success(res, { id: 1 }, 'Created', 201);

      expect(res.status).toHaveBeenCalledWith(201);
    });
  });

  describe('error', () => {
    it('should create an error response with message', () => {
      error(res, 'Something went wrong');

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Something went wrong',
      });
    });

    it('should include status code if provided', () => {
      error(res, 'Not found', 404);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Not found',
      });
    });

    it('should include errors if provided', () => {
      error(res, 'Validation failed', 400, [{ field: 'name', message: 'required' }]);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Validation failed',
        errors: [{ field: 'name', message: 'required' }],
      });
    });
  });

  describe('paginated', () => {
    it('should create a paginated response', () => {
      const items = [{ id: 1 }, { id: 2 }, { id: 3 }];
      paginated(res, items, {
        currentPage: 1,
        limit: 10,
        totalPages: 3,
        totalCount: 23,
        hasNextPage: true,
        hasPrevPage: false,
      });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Success',
        data: items,
        pagination: {
          page: 1,
          limit: 10,
          totalPages: 3,
          totalItems: 23,
          hasNextPage: true,
          hasPrevPage: false,
        },
      });
    });

    it('should handle empty results', () => {
      paginated(res, [], {
        currentPage: 1,
        limit: 10,
        totalPages: 0,
        totalCount: 0,
        hasNextPage: false,
        hasPrevPage: false,
      });

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [],
          pagination: expect.objectContaining({
            totalItems: 0,
            totalPages: 0,
          }),
        })
      );
    });
  });

  describe('created', () => {
    it('should return 201 with data', () => {
      created(res, { id: 1 });

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Resource created successfully',
        data: { id: 1 },
      });
    });
  });

  describe('noContent', () => {
    it('should return 204 with no body', () => {
      noContent(res);

      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
    });
  });

  describe('badRequest', () => {
    it('should return 400', () => {
      badRequest(res, 'Invalid input');

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, message: 'Invalid input' })
      );
    });
  });

  describe('unauthorized', () => {
    it('should return 401', () => {
      unauthorized(res);

      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('forbidden', () => {
    it('should return 403', () => {
      forbidden(res);

      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe('notFound', () => {
    it('should return 404', () => {
      notFound(res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('conflict', () => {
    it('should return 409', () => {
      conflict(res);

      expect(res.status).toHaveBeenCalledWith(409);
    });
  });

  describe('internalError', () => {
    it('should return 500', () => {
      internalError(res);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('should log error object if provided', () => {
      const logger = require('../../../utils/logger');
      const err = new Error('Something broke');
      internalError(res, 'Server error', err);

      expect(logger.error).toHaveBeenCalledWith('Internal Server Error:', {
        message: 'Something broke',
        stack: expect.any(String),
      });
    });
  });
});
