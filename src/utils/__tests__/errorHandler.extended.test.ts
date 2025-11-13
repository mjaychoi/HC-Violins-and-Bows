import { errorHandler } from '../errorHandler';
import { ErrorCodes, ErrorCategory } from '@/types/errors';

describe('ErrorHandler - Extended Tests', () => {
  beforeEach(() => {
    errorHandler.clearErrorLogs();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('handleSupabaseError - Extended', () => {
    it('should handle 401 status code', () => {
      const supabaseError = {
        status: 401,
        message: 'Unauthorized',
      };
      const error = errorHandler.handleSupabaseError(
        supabaseError,
        'Test operation'
      );

      expect(error.code).toBe(ErrorCodes.UNAUTHORIZED);
      expect(error.message).toBe('Authentication required');
    });

    it('should handle 403 status code', () => {
      const supabaseError = {
        status: 403,
        message: 'Forbidden',
      };
      const error = errorHandler.handleSupabaseError(
        supabaseError,
        'Test operation'
      );

      expect(error.code).toBe(ErrorCodes.FORBIDDEN);
      expect(error.message).toBe('Access denied');
    });

    it('should handle 404 status code', () => {
      const supabaseError = {
        status: 404,
        message: 'Not found',
      };
      const error = errorHandler.handleSupabaseError(
        supabaseError,
        'Test operation'
      );

      expect(error.code).toBe(ErrorCodes.RECORD_NOT_FOUND);
      expect(error.message).toBe('Resource not found');
    });

    it('should handle 500+ status codes', () => {
      const supabaseError = {
        status: 500,
        message: 'Internal server error',
      };
      const error = errorHandler.handleSupabaseError(
        supabaseError,
        'Test operation'
      );

      expect(error.code).toBe(ErrorCodes.INTERNAL_ERROR);
      expect(error.message).toBe('Server error');
    });

    it('should handle duplicate key error in message', () => {
      const supabaseError = {
        status: 400,
        message: 'Duplicate key violation',
      };
      const error = errorHandler.handleSupabaseError(
        supabaseError,
        'Test operation'
      );

      expect(error.code).toBe(ErrorCodes.DUPLICATE_RECORD);
      expect(error.message).toBe('Record already exists');
    });

    it('should handle JWT expired error', () => {
      const supabaseError = {
        code: 'PGRST301',
        message: 'JWT expired',
      };
      const error = errorHandler.handleSupabaseError(
        supabaseError,
        'Test operation'
      );

      expect(error.code).toBe(ErrorCodes.SESSION_EXPIRED);
      expect(error.message).toBe('Session expired');
    });

    it('should handle unknown PostgreSQL error codes', () => {
      const supabaseError = {
        code: '23502',
        message: 'Not null violation',
      };
      const error = errorHandler.handleSupabaseError(
        supabaseError,
        'Test operation'
      );

      expect(error.code).toBe(ErrorCodes.DATABASE_ERROR);
      expect(error.message).toBe('Not null violation');
    });

    it('should handle errors with details and hints', () => {
      const supabaseError = {
        code: '23505',
        message: 'Duplicate key',
        details: 'Key (id)=(1) already exists',
        hint: 'Use UPDATE instead',
      };
      const error = errorHandler.handleSupabaseError(
        supabaseError,
        'Test operation'
      );

      expect(error.code).toBe(ErrorCodes.DUPLICATE_RECORD);
      expect(error.details).toBe('Key (id)=(1) already exists');
    });

    it('should handle empty error object', () => {
      const error = errorHandler.handleSupabaseError({}, 'Test operation');

      expect(error.code).toBe(ErrorCodes.DATABASE_ERROR);
      expect(error.message).toBe('Database operation failed');
    });

    it('should handle error with only message', () => {
      const supabaseError = {
        message: 'Custom error message',
      };
      const error = errorHandler.handleSupabaseError(
        supabaseError,
        'Test operation'
      );

      expect(error.code).toBe(ErrorCodes.DATABASE_ERROR);
      expect(error.message).toBe('Database operation failed');
    });
  });

  describe('handleNetworkError - Extended', () => {
    it('should handle 404 status in network error', () => {
      const networkError = {
        response: {
          status: 404,
          data: {
            message: 'Resource not found',
          },
        },
      };
      const error = errorHandler.handleNetworkError(networkError, '/api/test');

      expect(error.code).toBe(ErrorCodes.RECORD_NOT_FOUND);
      expect(error.message).toBe('Resource not found');
    });

    it('should handle 500 status in network error', () => {
      const networkError = {
        response: {
          status: 500,
          data: {
            message: 'Internal server error',
          },
        },
      };
      const error = errorHandler.handleNetworkError(networkError, '/api/test');

      expect(error.code).toBe(ErrorCodes.INTERNAL_ERROR);
      expect(error.message).toBe('Server error');
    });

    it('should handle network error without response', () => {
      const networkError = {
        message: 'Network request failed',
      };
      const error = errorHandler.handleNetworkError(networkError, '/api/test');

      expect(error.code).toBe(ErrorCodes.NETWORK_ERROR);
      expect(error.message).toBe('Network request failed');
    });

    it('should handle network error with custom message in response data', () => {
      const networkError = {
        response: {
          status: 400,
          data: {
            message: 'Bad request',
          },
        },
      };
      const error = errorHandler.handleNetworkError(networkError, '/api/test');

      expect(error.message).toBe('Bad request');
    });

    it('should handle network error without response data message', () => {
      const networkError = {
        response: {
          status: 400,
        },
      };
      const error = errorHandler.handleNetworkError(networkError, '/api/test');

      expect(error.message).toBe('Request failed');
    });
  });

  describe('createValidationError - Extended', () => {
    it('should create validation error with field and value', () => {
      const error = errorHandler.createValidationError(
        'Invalid value',
        'email',
        'invalid-email',
        'Email format is invalid'
      );

      expect(error.code).toBe(ErrorCodes.VALIDATION_ERROR);
      expect(error.message).toBe('Invalid value');
      expect(error.field).toBe('email');
      expect(error.value).toBe('invalid-email');
      expect(error.details).toBe('Email format is invalid');
    });

    it('should create validation error without field', () => {
      const error = errorHandler.createValidationError('Invalid value');

      expect(error.code).toBe(ErrorCodes.VALIDATION_ERROR);
      expect(error.message).toBe('Invalid value');
      expect(error.field).toBeUndefined();
    });
  });

  describe('getUserFriendlyMessage - Extended', () => {
    it('should return friendly message for DATABASE_ERROR', () => {
      const error = errorHandler.createError(
        ErrorCodes.DATABASE_ERROR,
        'Database failed'
      );
      const message = errorHandler.getUserFriendlyMessage(error);

      expect(message).toBe('Database error occurred.');
    });

    it('should return friendly message for VALIDATION_ERROR', () => {
      const error = errorHandler.createError(
        ErrorCodes.VALIDATION_ERROR,
        'Invalid data'
      );
      const message = errorHandler.getUserFriendlyMessage(error);

      expect(message).toBe('Please check your input data.');
    });

    it('should return friendly message for UNAUTHORIZED', () => {
      const error = errorHandler.createError(
        ErrorCodes.UNAUTHORIZED,
        'Not authorized'
      );
      const message = errorHandler.getUserFriendlyMessage(error);

      expect(message).toBe('Login required.');
    });

    it('should return friendly message for FORBIDDEN', () => {
      const error = errorHandler.createError(
        ErrorCodes.FORBIDDEN,
        'Access denied'
      );
      const message = errorHandler.getUserFriendlyMessage(error);

      expect(message).toBe('Access denied.');
    });

    it('should return friendly message for SESSION_EXPIRED', () => {
      const error = errorHandler.createError(
        ErrorCodes.SESSION_EXPIRED,
        'Session expired'
      );
      const message = errorHandler.getUserFriendlyMessage(error);

      expect(message).toBe('Session expired. Please login again.');
    });

    it('should return friendly message for DUPLICATE_RECORD', () => {
      const error = errorHandler.createError(
        ErrorCodes.DUPLICATE_RECORD,
        'Duplicate'
      );
      const message = errorHandler.getUserFriendlyMessage(error);

      expect(message).toBe('Data already exists.');
    });

    it('should return friendly message for RECORD_NOT_FOUND', () => {
      const error = errorHandler.createError(
        ErrorCodes.RECORD_NOT_FOUND,
        'Not found'
      );
      const message = errorHandler.getUserFriendlyMessage(error);

      expect(message).toBe('Requested data not found.');
    });

    it('should return friendly message for TIMEOUT_ERROR', () => {
      const error = errorHandler.createError(
        ErrorCodes.TIMEOUT_ERROR,
        'Timeout'
      );
      const message = errorHandler.getUserFriendlyMessage(error);

      expect(message).toBe('Request timeout. Please try again.');
    });

    it('should return friendly message for INTERNAL_ERROR', () => {
      const error = errorHandler.createError(
        ErrorCodes.INTERNAL_ERROR,
        'Internal error'
      );
      const message = errorHandler.getUserFriendlyMessage(error);

      expect(message).toBe('Server error occurred.');
    });
  });

  describe('getRecoverySuggestions - Extended', () => {
    it('should provide suggestions for DATABASE_ERROR', () => {
      const error = errorHandler.createError(
        ErrorCodes.DATABASE_ERROR,
        'Database error'
      );
      const suggestions = errorHandler.getRecoverySuggestions(error);

      expect(suggestions).toContain('Please try again later');
      expect(suggestions.length).toBeGreaterThan(0);
    });

    it('should provide suggestions for UNAUTHORIZED', () => {
      const error = errorHandler.createError(
        ErrorCodes.UNAUTHORIZED,
        'Not authorized'
      );
      const suggestions = errorHandler.getRecoverySuggestions(error);

      expect(suggestions).toContain('Redirecting to login page');
    });

    it('should provide suggestions for FORBIDDEN', () => {
      const error = errorHandler.createError(ErrorCodes.FORBIDDEN, 'Forbidden');
      const suggestions = errorHandler.getRecoverySuggestions(error);

      expect(suggestions).toContain(
        'Contact administrator for permission request'
      );
    });

    it('should provide suggestions for SESSION_EXPIRED', () => {
      const error = errorHandler.createError(
        ErrorCodes.SESSION_EXPIRED,
        'Expired'
      );
      const suggestions = errorHandler.getRecoverySuggestions(error);

      // SESSION_EXPIRED는 UNAUTHORIZED와 같은 카테고리이므로 비슷한 제안이 나올 수 있음
      expect(suggestions.length).toBeGreaterThan(0);
    });

    it('should provide suggestions for TIMEOUT_ERROR', () => {
      const error = errorHandler.createError(
        ErrorCodes.TIMEOUT_ERROR,
        'Timeout'
      );
      const suggestions = errorHandler.getRecoverySuggestions(error);

      expect(suggestions).toContain('Request timeout occurred');
      expect(suggestions).toContain('Check network status and try again');
    });
  });

  describe('shouldRetry - Extended', () => {
    it('should allow retry for TIMEOUT_ERROR', () => {
      const error = errorHandler.createError(
        ErrorCodes.TIMEOUT_ERROR,
        'Timeout'
      );
      const shouldRetry = errorHandler.shouldRetry(error, 'test-operation');

      expect(shouldRetry).toBe(true);
    });

    it('should allow retry for INTERNAL_ERROR', () => {
      const error = errorHandler.createError(
        ErrorCodes.INTERNAL_ERROR,
        'Internal error'
      );
      const shouldRetry = errorHandler.shouldRetry(error, 'test-operation');

      expect(shouldRetry).toBe(true);
    });

    it('should not allow retry for VALIDATION_ERROR', () => {
      const error = errorHandler.createError(
        ErrorCodes.VALIDATION_ERROR,
        'Invalid'
      );
      const shouldRetry = errorHandler.shouldRetry(error, 'test-operation');

      expect(shouldRetry).toBe(false);
    });

    it('should not allow retry for DUPLICATE_RECORD', () => {
      const error = errorHandler.createError(
        ErrorCodes.DUPLICATE_RECORD,
        'Duplicate'
      );
      const shouldRetry = errorHandler.shouldRetry(error, 'test-operation');

      expect(shouldRetry).toBe(false);
    });

    it('should not allow retry for UNAUTHORIZED', () => {
      const error = errorHandler.createError(
        ErrorCodes.UNAUTHORIZED,
        'Unauthorized'
      );
      const shouldRetry = errorHandler.shouldRetry(error, 'test-operation');

      expect(shouldRetry).toBe(false);
    });
  });

  describe('getErrorCategory - Extended', () => {
    it('should categorize VALIDATION_ERROR', () => {
      const error = errorHandler.createError(
        ErrorCodes.VALIDATION_ERROR,
        'Invalid'
      );
      const category = errorHandler.getErrorCategory(error);

      expect(category).toBe(ErrorCategory.VALIDATION);
    });

    it('should categorize DATABASE_ERROR', () => {
      const error = errorHandler.createError(
        ErrorCodes.DATABASE_ERROR,
        'DB error'
      );
      const category = errorHandler.getErrorCategory(error);

      expect(category).toBe(ErrorCategory.DATABASE);
    });

    it('should categorize SESSION_EXPIRED as AUTHENTICATION', () => {
      const error = errorHandler.createError(
        ErrorCodes.SESSION_EXPIRED,
        'Expired'
      );
      const category = errorHandler.getErrorCategory(error);

      expect(category).toBe(ErrorCategory.AUTHENTICATION);
    });

    it('should categorize TIMEOUT_ERROR as NETWORK', () => {
      const error = errorHandler.createError(
        ErrorCodes.TIMEOUT_ERROR,
        'Timeout'
      );
      const category = errorHandler.getErrorCategory(error);

      expect(category).toBe(ErrorCategory.NETWORK);
    });
  });

  describe('error logging - Extended', () => {
    it('should log errors', () => {
      const error = errorHandler.createError(
        ErrorCodes.NETWORK_ERROR,
        'Network failed'
      );
      errorHandler.logError(error);

      const errorLogs = errorHandler.getErrorLogs();
      expect(errorLogs.length).toBeGreaterThan(0);
      expect(errorLogs[0]).toEqual(error);
    });

    it('should clear error logs', () => {
      const error = errorHandler.createError(
        ErrorCodes.NETWORK_ERROR,
        'Network failed'
      );
      errorHandler.logError(error);
      errorHandler.clearErrorLogs();

      const errorLogs = errorHandler.getErrorLogs();
      expect(errorLogs.length).toBe(0);
    });

    it('should track error counts by code', () => {
      const error1 = errorHandler.createError(
        ErrorCodes.NETWORK_ERROR,
        'Network failed'
      );
      const error2 = errorHandler.createError(
        ErrorCodes.NETWORK_ERROR,
        'Network failed again'
      );
      const error3 = errorHandler.createError(
        ErrorCodes.VALIDATION_ERROR,
        'Invalid'
      );

      errorHandler.logError(error1);
      errorHandler.logError(error2);
      errorHandler.logError(error3);

      expect(errorHandler.getErrorCount(ErrorCodes.NETWORK_ERROR)).toBe(2);
      expect(errorHandler.getErrorCount(ErrorCodes.VALIDATION_ERROR)).toBe(1);
    });

    it('should get error statistics', () => {
      const error1 = errorHandler.createError(
        ErrorCodes.NETWORK_ERROR,
        'Network failed'
      );
      const error2 = errorHandler.createError(
        ErrorCodes.VALIDATION_ERROR,
        'Invalid'
      );

      errorHandler.logError(error1);
      errorHandler.logError(error2);

      const stats = errorHandler.getErrorStats();
      expect(stats.get(ErrorCodes.NETWORK_ERROR)).toBe(1);
      expect(stats.get(ErrorCodes.VALIDATION_ERROR)).toBe(1);
    });
  });

  describe('retry tracking - Extended', () => {
    it('should track retry attempts for multiple operations', () => {
      errorHandler.recordRetryAttempt('operation-1');
      errorHandler.recordRetryAttempt('operation-1');
      errorHandler.recordRetryAttempt('operation-2');

      expect(errorHandler.getRetryCount('operation-1')).toBe(2);
      expect(errorHandler.getRetryCount('operation-2')).toBe(1);
    });

    it('should clear retry attempts for specific operation', () => {
      errorHandler.recordRetryAttempt('operation-1');
      errorHandler.recordRetryAttempt('operation-1');
      errorHandler.clearRetryAttempts('operation-1');

      expect(errorHandler.getRetryCount('operation-1')).toBe(0);
    });

    it('should return 0 for unknown operation', () => {
      expect(errorHandler.getRetryCount('unknown-operation')).toBe(0);
    });
  });
});
