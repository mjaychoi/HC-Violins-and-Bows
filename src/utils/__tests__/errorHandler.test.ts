import {
  errorHandler,
  isNetworkError,
  isValidationError,
  isAuthError,
} from '../errorHandler';
import { ErrorCodes, ErrorCategory } from '@/types/errors';

describe('ErrorHandler', () => {
  beforeEach(() => {
    errorHandler.clearErrorLogs();
  });

  describe('createError', () => {
    it('should create a standardized error', () => {
      const error = errorHandler.createError(
        ErrorCodes.NETWORK_ERROR,
        'Network failed',
        'Connection timeout',
        { endpoint: '/api/test' }
      );

      expect(error.code).toBe(ErrorCodes.NETWORK_ERROR);
      expect(error.message).toBe('Network failed');
      expect(error.details).toBe('Connection timeout');
      expect(error.context).toEqual({ endpoint: '/api/test' });
      expect(error.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('handleSupabaseError', () => {
    it('should handle unique constraint violation', () => {
      const supabaseError = { code: '23505', message: 'Duplicate key' };
      const error = errorHandler.handleSupabaseError(
        supabaseError,
        'Create client'
      );

      expect(error.code).toBe(ErrorCodes.DUPLICATE_RECORD);
      expect(error.message).toBe('Record already exists');
    });

    it('should handle foreign key constraint violation', () => {
      const supabaseError = { code: '23503', message: 'Foreign key violation' };
      const error = errorHandler.handleSupabaseError(
        supabaseError,
        'Delete client'
      );

      expect(error.code).toBe(ErrorCodes.VALIDATION_ERROR);
      expect(error.message).toBe('Invalid reference to related record');
    });

    it('should handle RLS error', () => {
      const supabaseError = { code: 'PGRST116', message: 'RLS violation' };
      const error = errorHandler.handleSupabaseError(
        supabaseError,
        'Query data'
      );

      expect(error.code).toBe(ErrorCodes.FORBIDDEN);
      expect(error.message).toBe('Access denied');
    });
  });

  describe('handleNetworkError', () => {
    it('should handle timeout error', () => {
      const networkError = { name: 'AbortError', message: 'Request timeout' };
      const error = errorHandler.handleNetworkError(networkError, '/api/test');

      expect(error.code).toBe(ErrorCodes.TIMEOUT_ERROR);
      expect(error.message).toBe('Request timed out');
    });

    it('should handle 401 unauthorized', () => {
      const networkError = { response: { status: 401 } };
      const error = errorHandler.handleNetworkError(networkError, '/api/test');

      expect(error.code).toBe(ErrorCodes.UNAUTHORIZED);
      expect(error.message).toBe('Authentication required');
    });

    it('should handle 403 forbidden', () => {
      const networkError = { response: { status: 403 } };
      const error = errorHandler.handleNetworkError(networkError, '/api/test');

      expect(error.code).toBe(ErrorCodes.FORBIDDEN);
      expect(error.message).toBe('Access denied');
    });
  });

  describe('getUserFriendlyMessage', () => {
    it('should return English messages for known error codes', () => {
      const error = errorHandler.createError(
        ErrorCodes.NETWORK_ERROR,
        'Network failed'
      );
      const message = errorHandler.getUserFriendlyMessage(error);

      expect(message).toBe(
        'Network connection error. Please check your internet connection.'
      );
    });

    it('should return original message for unknown error codes', () => {
      const error = errorHandler.createError(
        'UNKNOWN_CODE' as ErrorCodes,
        'Custom error'
      );
      const message = errorHandler.getUserFriendlyMessage(error);

      expect(message).toBe('An error occurred. Please try again.');
    });
  });

  describe('getRecoverySuggestions', () => {
    it('should provide network error suggestions', () => {
      const error = errorHandler.createError(
        ErrorCodes.NETWORK_ERROR,
        'Network failed'
      );
      const suggestions = errorHandler.getRecoverySuggestions(error);

      expect(suggestions).toContain('Check your internet connection');
      expect(suggestions).toContain('Please try again later');
    });

    it('should provide validation error suggestions', () => {
      const error = errorHandler.createError(
        ErrorCodes.VALIDATION_ERROR,
        'Invalid data'
      );
      const suggestions = errorHandler.getRecoverySuggestions(error);

      expect(suggestions).toContain('Please verify your input information');
    });
  });

  describe('retry logic', () => {
    it('should allow retry for network errors', () => {
      const error = errorHandler.createError(
        ErrorCodes.NETWORK_ERROR,
        'Network failed'
      );
      const shouldRetry = errorHandler.shouldRetry(error, 'test-operation');

      expect(shouldRetry).toBe(true);
    });

    it('should not allow retry for validation errors', () => {
      const error = errorHandler.createError(
        ErrorCodes.VALIDATION_ERROR,
        'Invalid data'
      );
      const shouldRetry = errorHandler.shouldRetry(error, 'test-operation');

      expect(shouldRetry).toBe(false);
    });

    it('should track retry attempts', () => {
      const operationId = 'test-operation';

      errorHandler.recordRetryAttempt(operationId);
      expect(errorHandler.getRetryCount(operationId)).toBe(1);

      errorHandler.recordRetryAttempt(operationId);
      expect(errorHandler.getRetryCount(operationId)).toBe(2);

      errorHandler.clearRetryAttempts(operationId);
      expect(errorHandler.getRetryCount(operationId)).toBe(0);
    });
  });

  describe('error statistics', () => {
    it('should track error counts', () => {
      const error1 = errorHandler.createError(
        ErrorCodes.NETWORK_ERROR,
        'Network failed'
      );
      const error2 = errorHandler.createError(
        ErrorCodes.NETWORK_ERROR,
        'Network failed again'
      );

      errorHandler.logError(error1);
      errorHandler.logError(error2);

      expect(errorHandler.getErrorCount(ErrorCodes.NETWORK_ERROR)).toBe(2);
    });
  });

  describe('getErrorCategory', () => {
    it('should categorize network errors', () => {
      const error = errorHandler.createError(
        ErrorCodes.NETWORK_ERROR,
        'Network failed'
      );
      const category = errorHandler.getErrorCategory(error);

      expect(category).toBe(ErrorCategory.NETWORK);
    });

    it('should categorize authentication errors', () => {
      const error = errorHandler.createError(
        ErrorCodes.UNAUTHORIZED,
        'Not authorized'
      );
      const category = errorHandler.getErrorCategory(error);

      expect(category).toBe(ErrorCategory.AUTHENTICATION);
    });
  });
});

describe('Utility functions', () => {
  describe('isNetworkError', () => {
    it('should identify network errors', () => {
      expect(isNetworkError({ name: 'NetworkError' })).toBe(true);
      expect(isNetworkError({ name: 'AbortError' })).toBe(true);
    });
  });

  describe('isValidationError', () => {
    it('should identify validation errors', () => {
      expect(isValidationError({ code: ErrorCodes.VALIDATION_ERROR })).toBe(
        true
      );
      expect(isValidationError({ code: ErrorCodes.REQUIRED_FIELD })).toBe(true);
    });
  });

  describe('isAuthError', () => {
    it('should identify authentication errors', () => {
      expect(isAuthError({ code: ErrorCodes.UNAUTHORIZED })).toBe(true);
      expect(isAuthError({ code: ErrorCodes.FORBIDDEN })).toBe(true);
    });
  });
});
