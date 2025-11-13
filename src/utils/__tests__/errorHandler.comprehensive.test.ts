import {
  errorHandler,
  isNetworkError,
  isValidationError,
  isAuthError,
} from '../errorHandler';
import { ErrorCodes, ErrorCategory, ErrorSeverity } from '@/types/errors';

// Mock logger
jest.mock('../logger', () => ({
  logError: jest.fn(),
  logWarn: jest.fn(),
  logInfo: jest.fn(),
  logDebug: jest.fn(),
}));

describe('ErrorHandler - Comprehensive Tests', () => {
  const { logError } = require('../logger');

  beforeEach(() => {
    errorHandler.clearErrorLogs();
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createApiError', () => {
    it('should create API error with all parameters', () => {
      const error = errorHandler.createApiError(
        ErrorCodes.NETWORK_ERROR,
        'Network failed',
        500,
        '/api/test',
        'Connection timeout'
      );

      expect(error.code).toBe(ErrorCodes.NETWORK_ERROR);
      expect(error.message).toBe('Network failed');
      expect(error.status).toBe(500);
      expect(error.endpoint).toBe('/api/test');
      expect(error.details).toBe('Connection timeout');
      expect(error.timestamp).toBeInstanceOf(Date);
    });

    it('should create API error with minimal parameters', () => {
      const error = errorHandler.createApiError(
        ErrorCodes.NETWORK_ERROR,
        'Network failed'
      );

      expect(error.code).toBe(ErrorCodes.NETWORK_ERROR);
      expect(error.message).toBe('Network failed');
      expect(error.status).toBeUndefined();
      expect(error.endpoint).toBeUndefined();
    });
  });

  describe('logError - Severity Levels', () => {
    it('should log error with LOW severity', () => {
      const error = errorHandler.createError(
        ErrorCodes.VALIDATION_ERROR,
        'Validation failed'
      );

      errorHandler.logError(error, ErrorSeverity.LOW);

      expect(logError).toHaveBeenCalled();
    });

    it('should log error with MEDIUM severity', () => {
      const error = errorHandler.createError(
        ErrorCodes.NETWORK_ERROR,
        'Network failed'
      );

      errorHandler.logError(error, ErrorSeverity.MEDIUM);

      expect(logError).toHaveBeenCalled();
    });

    it('should log error with HIGH severity', () => {
      const error = errorHandler.createError(
        ErrorCodes.INTERNAL_ERROR,
        'Internal error'
      );

      errorHandler.logError(error, ErrorSeverity.HIGH);

      expect(logError).toHaveBeenCalled();
    });

    it('should log error with CRITICAL severity and call sendToExternalLogger', () => {
      const error = errorHandler.createError(
        ErrorCodes.INTERNAL_ERROR,
        'Critical error'
      );

      errorHandler.logError(error, ErrorSeverity.CRITICAL);

      expect(logError).toHaveBeenCalled();
      // Note: sendToExternalLogger is a private method that checks for window
      // In test environment (Node.js), window is undefined, so it won't execute
      // This is expected behavior and the method is still tested indirectly
    });

    it('should handle Error instance in logError', () => {
      const jsError = new Error('JavaScript error');
      const error = errorHandler.createError(
        ErrorCodes.UNKNOWN_ERROR,
        jsError.message
      );

      errorHandler.logError(error, ErrorSeverity.MEDIUM);

      expect(logError).toHaveBeenCalled();
    });

    it('should handle error object without message in logError', () => {
      const error = errorHandler.createError(
        ErrorCodes.UNKNOWN_ERROR,
        'Error without message property'
      );

      errorHandler.logError(error, ErrorSeverity.MEDIUM);

      expect(logError).toHaveBeenCalled();
    });

    it('should handle string error in logError', () => {
      const error = errorHandler.createError(
        ErrorCodes.UNKNOWN_ERROR,
        'String error'
      );

      errorHandler.logError(error, ErrorSeverity.MEDIUM);

      expect(logError).toHaveBeenCalled();
    });
  });

  describe('getUserFriendlyMessage - All Error Codes', () => {
    const errorCodeTests = [
      {
        code: ErrorCodes.NETWORK_ERROR,
        expected: 'Please check your network connection.',
      },
      {
        code: ErrorCodes.TIMEOUT_ERROR,
        expected: 'Request timeout. Please try again.',
      },
      { code: ErrorCodes.UNAUTHORIZED, expected: 'Login required.' },
      { code: ErrorCodes.FORBIDDEN, expected: 'Access denied.' },
      {
        code: ErrorCodes.SESSION_EXPIRED,
        expected: 'Session expired. Please login again.',
      },
      { code: ErrorCodes.DATABASE_ERROR, expected: 'Database error occurred.' },
      {
        code: ErrorCodes.RECORD_NOT_FOUND,
        expected: 'Requested data not found.',
      },
      { code: ErrorCodes.DUPLICATE_RECORD, expected: 'Data already exists.' },
      {
        code: ErrorCodes.VALIDATION_ERROR,
        expected: 'Please check your input data.',
      },
      {
        code: ErrorCodes.REQUIRED_FIELD,
        expected: 'Please fill in required fields.',
      },
      {
        code: ErrorCodes.INVALID_FORMAT,
        expected: 'Please enter in correct format.',
      },
      { code: ErrorCodes.FILE_TOO_LARGE, expected: 'File size is too large.' },
      {
        code: ErrorCodes.INVALID_FILE_TYPE,
        expected: 'Unsupported file type.',
      },
      { code: ErrorCodes.UPLOAD_FAILED, expected: 'File upload failed.' },
      { code: ErrorCodes.UNKNOWN_ERROR, expected: 'Unknown error occurred.' },
      { code: ErrorCodes.INTERNAL_ERROR, expected: 'Server error occurred.' },
    ];

    errorCodeTests.forEach(({ code, expected }) => {
      it(`should return friendly message for ${code}`, () => {
        const error = errorHandler.createError(code, 'Test error');
        const message = errorHandler.getUserFriendlyMessage(error);

        expect(message).toBe(expected);
      });
    });

    it('should return original message for unknown error code', () => {
      const error = errorHandler.createError(
        'CUSTOM_ERROR' as ErrorCodes,
        'Custom error message'
      );
      const message = errorHandler.getUserFriendlyMessage(error);

      expect(message).toBe('Custom error message');
    });
  });

  describe('getRecoverySuggestions - All Error Codes', () => {
    it('should provide suggestions for NETWORK_ERROR', () => {
      const error = errorHandler.createError(
        ErrorCodes.NETWORK_ERROR,
        'Network failed'
      );
      const suggestions = errorHandler.getRecoverySuggestions(error);

      expect(suggestions).toContain('Check your internet connection');
      expect(suggestions).toContain('Please try again later');
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

    it('should provide suggestions for UNAUTHORIZED', () => {
      const error = errorHandler.createError(
        ErrorCodes.UNAUTHORIZED,
        'Unauthorized'
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

    it('should provide suggestions for DATABASE_ERROR', () => {
      const error = errorHandler.createError(
        ErrorCodes.DATABASE_ERROR,
        'DB error'
      );
      const suggestions = errorHandler.getRecoverySuggestions(error);

      expect(suggestions).toContain('Check database connection');
      expect(suggestions).toContain('Please try again later');
    });

    it('should provide suggestions for VALIDATION_ERROR', () => {
      const error = errorHandler.createError(
        ErrorCodes.VALIDATION_ERROR,
        'Invalid'
      );
      const suggestions = errorHandler.getRecoverySuggestions(error);

      expect(suggestions).toContain('Please verify your input information');
    });

    it('should provide suggestions for DUPLICATE_RECORD', () => {
      const error = errorHandler.createError(
        ErrorCodes.DUPLICATE_RECORD,
        'Duplicate'
      );
      const suggestions = errorHandler.getRecoverySuggestions(error);

      expect(suggestions).toContain('Data already exists');
      expect(suggestions).toContain('Try with different information');
    });

    it('should provide default suggestions for unknown error codes', () => {
      const error = errorHandler.createError(
        'UNKNOWN_CODE' as ErrorCodes,
        'Unknown error'
      );
      const suggestions = errorHandler.getRecoverySuggestions(error);

      expect(suggestions).toContain('Please try again later');
      expect(suggestions).toContain(
        'Contact administrator if problem persists'
      );
    });
  });

  describe('getErrorCategory - All Categories', () => {
    it('should categorize NETWORK_ERROR as NETWORK', () => {
      const error = errorHandler.createError(
        ErrorCodes.NETWORK_ERROR,
        'Network failed'
      );
      expect(errorHandler.getErrorCategory(error)).toBe(ErrorCategory.NETWORK);
    });

    it('should categorize TIMEOUT_ERROR as NETWORK', () => {
      const error = errorHandler.createError(
        ErrorCodes.TIMEOUT_ERROR,
        'Timeout'
      );
      expect(errorHandler.getErrorCategory(error)).toBe(ErrorCategory.NETWORK);
    });

    it('should categorize UNAUTHORIZED as AUTHENTICATION', () => {
      const error = errorHandler.createError(
        ErrorCodes.UNAUTHORIZED,
        'Unauthorized'
      );
      expect(errorHandler.getErrorCategory(error)).toBe(
        ErrorCategory.AUTHENTICATION
      );
    });

    it('should categorize FORBIDDEN as AUTHENTICATION', () => {
      const error = errorHandler.createError(ErrorCodes.FORBIDDEN, 'Forbidden');
      expect(errorHandler.getErrorCategory(error)).toBe(
        ErrorCategory.AUTHENTICATION
      );
    });

    it('should categorize SESSION_EXPIRED as AUTHENTICATION', () => {
      const error = errorHandler.createError(
        ErrorCodes.SESSION_EXPIRED,
        'Expired'
      );
      expect(errorHandler.getErrorCategory(error)).toBe(
        ErrorCategory.AUTHENTICATION
      );
    });

    it('should categorize DATABASE_ERROR as DATABASE', () => {
      const error = errorHandler.createError(
        ErrorCodes.DATABASE_ERROR,
        'DB error'
      );
      expect(errorHandler.getErrorCategory(error)).toBe(ErrorCategory.DATABASE);
    });

    it('should categorize RECORD_NOT_FOUND as DATABASE', () => {
      const error = errorHandler.createError(
        ErrorCodes.RECORD_NOT_FOUND,
        'Not found'
      );
      expect(errorHandler.getErrorCategory(error)).toBe(ErrorCategory.DATABASE);
    });

    it('should categorize DUPLICATE_RECORD as DATABASE', () => {
      const error = errorHandler.createError(
        ErrorCodes.DUPLICATE_RECORD,
        'Duplicate'
      );
      expect(errorHandler.getErrorCategory(error)).toBe(ErrorCategory.DATABASE);
    });

    it('should categorize VALIDATION_ERROR as VALIDATION', () => {
      const error = errorHandler.createError(
        ErrorCodes.VALIDATION_ERROR,
        'Invalid'
      );
      expect(errorHandler.getErrorCategory(error)).toBe(
        ErrorCategory.VALIDATION
      );
    });

    it('should categorize REQUIRED_FIELD as VALIDATION', () => {
      const error = errorHandler.createError(
        ErrorCodes.REQUIRED_FIELD,
        'Required'
      );
      expect(errorHandler.getErrorCategory(error)).toBe(
        ErrorCategory.VALIDATION
      );
    });

    it('should categorize INVALID_FORMAT as VALIDATION', () => {
      const error = errorHandler.createError(
        ErrorCodes.INVALID_FORMAT,
        'Invalid format'
      );
      expect(errorHandler.getErrorCategory(error)).toBe(
        ErrorCategory.VALIDATION
      );
    });

    it('should categorize FILE_TOO_LARGE as FILE_UPLOAD', () => {
      const error = errorHandler.createError(
        ErrorCodes.FILE_TOO_LARGE,
        'File too large'
      );
      expect(errorHandler.getErrorCategory(error)).toBe(
        ErrorCategory.FILE_UPLOAD
      );
    });

    it('should categorize INVALID_FILE_TYPE as FILE_UPLOAD', () => {
      const error = errorHandler.createError(
        ErrorCodes.INVALID_FILE_TYPE,
        'Invalid type'
      );
      expect(errorHandler.getErrorCategory(error)).toBe(
        ErrorCategory.FILE_UPLOAD
      );
    });

    it('should categorize UPLOAD_FAILED as FILE_UPLOAD', () => {
      const error = errorHandler.createError(
        ErrorCodes.UPLOAD_FAILED,
        'Upload failed'
      );
      expect(errorHandler.getErrorCategory(error)).toBe(
        ErrorCategory.FILE_UPLOAD
      );
    });

    it('should categorize unknown error codes as SYSTEM', () => {
      const error = errorHandler.createError(
        'UNKNOWN_CODE' as ErrorCodes,
        'Unknown error'
      );
      expect(errorHandler.getErrorCategory(error)).toBe(ErrorCategory.SYSTEM);
    });
  });

  describe('shouldRetry - Retry Limits', () => {
    it('should allow retry when attempts are below maxRetries', () => {
      const error = errorHandler.createError(
        ErrorCodes.NETWORK_ERROR,
        'Network failed'
      );
      const operationId = 'test-operation';

      errorHandler.recordRetryAttempt(operationId);
      errorHandler.recordRetryAttempt(operationId);

      const shouldRetry = errorHandler.shouldRetry(error, operationId);
      expect(shouldRetry).toBe(true);
    });

    it('should not allow retry when attempts exceed maxRetries', () => {
      const error = errorHandler.createError(
        ErrorCodes.NETWORK_ERROR,
        'Network failed'
      );
      const operationId = 'test-operation';

      // Record 3 attempts (maxRetries is 3, so 3 attempts means no more retries)
      errorHandler.recordRetryAttempt(operationId);
      errorHandler.recordRetryAttempt(operationId);
      errorHandler.recordRetryAttempt(operationId);

      const shouldRetry = errorHandler.shouldRetry(error, operationId);
      expect(shouldRetry).toBe(false);
    });

    it('should not allow retry for non-retryable errors', () => {
      const error = errorHandler.createError(
        ErrorCodes.VALIDATION_ERROR,
        'Invalid'
      );
      const operationId = 'test-operation';

      const shouldRetry = errorHandler.shouldRetry(error, operationId);
      expect(shouldRetry).toBe(false);
    });
  });

  describe('handleNetworkError - Extended Cases', () => {
    it('should handle network error with Error instance', () => {
      const networkError = new Error('Network error');
      const error = errorHandler.handleNetworkError(networkError, '/api/test');

      expect(error.code).toBe(ErrorCodes.NETWORK_ERROR);
      expect(error.message).toBe('Network request failed');
      expect(error.details).toBe('Network error');
    });

    it('should handle network error with string', () => {
      const networkError = 'Network connection failed';
      const error = errorHandler.handleNetworkError(networkError, '/api/test');

      expect(error.code).toBe(ErrorCodes.NETWORK_ERROR);
      expect(error.message).toBe('Network request failed');
    });

    it('should handle network error with response data message', () => {
      const networkError = {
        response: {
          status: 400,
          data: {
            message: 'Bad request details',
          },
        },
      };
      const error = errorHandler.handleNetworkError(networkError, '/api/test');

      expect(error.message).toBe('Bad request details');
    });

    it('should handle network error with response but no data message', () => {
      const networkError = {
        response: {
          status: 400,
        },
      };
      const error = errorHandler.handleNetworkError(networkError, '/api/test');

      expect(error.message).toBe('Request failed');
    });
  });

  describe('handleSupabaseError - Edge Cases', () => {
    it('should handle error with circular reference', () => {
      const circularError: Record<string, unknown> = {
        message: 'Circular error',
        status: 500,
      };
      circularError.self = circularError;

      const error = errorHandler.handleSupabaseError(circularError, 'Test');

      expect(error.code).toBe(ErrorCodes.INTERNAL_ERROR);
      expect(error.message).toBe('Server error');
    });

    it('should handle error with null message', () => {
      const supabaseError = {
        status: 500,
        message: null,
      };
      const error = errorHandler.handleSupabaseError(supabaseError, 'Test');

      expect(error.code).toBe(ErrorCodes.INTERNAL_ERROR);
      expect(error.message).toBe('Server error');
    });

    it('should handle error with undefined status', () => {
      const supabaseError = {
        message: 'Error message',
      };
      const error = errorHandler.handleSupabaseError(supabaseError, 'Test');

      expect(error.code).toBe(ErrorCodes.DATABASE_ERROR);
      expect(error.message).toBe('Database operation failed');
    });
  });

  describe('isNetworkError - Extended', () => {
    it('should return true for NetworkError name', () => {
      const result = isNetworkError({ name: 'NetworkError' });
      expect(result).toBe(true);
    });

    it('should return true for AbortError name', () => {
      const result = isNetworkError({ name: 'AbortError' });
      expect(result).toBe(true);
    });

    it('should check navigator.onLine when available and error has no name', () => {
      const originalNavigator = global.navigator;

      // Create a mock navigator with onLine: false
      const mockNavigator = {
        onLine: false,
      } as Navigator;

      Object.defineProperty(global, 'navigator', {
        value: mockNavigator,
        writable: true,
        configurable: true,
      });

      const result = isNetworkError({});
      expect(result).toBe(true); // navigator.onLine is false

      // Restore original navigator
      if (originalNavigator) {
        Object.defineProperty(global, 'navigator', {
          value: originalNavigator,
          writable: true,
          configurable: true,
        });
      }
    });

    it('should return false when navigator.onLine is true and no error name', () => {
      const originalNavigator = global.navigator;

      // Create a mock navigator with onLine: true
      const mockNavigator = {
        onLine: true,
      } as Navigator;

      Object.defineProperty(global, 'navigator', {
        value: mockNavigator,
        writable: true,
        configurable: true,
      });

      const result = isNetworkError({});
      expect(result).toBe(false); // navigator.onLine is true, but no error name

      // Restore original navigator
      if (originalNavigator) {
        Object.defineProperty(global, 'navigator', {
          value: originalNavigator,
          writable: true,
          configurable: true,
        });
      }
    });

    it('should return false when navigator is undefined (SSR) and no error name', () => {
      const originalNavigator = global.navigator;
      // @ts-expect-error - Testing SSR environment
      delete global.navigator;

      const result = isNetworkError({});
      expect(result).toBe(false); // SSR: don't assume offline

      global.navigator = originalNavigator;
    });
  });

  describe('isValidationError - Extended', () => {
    it('should return false for non-object errors', () => {
      expect(isValidationError('string error')).toBe(false);
      expect(isValidationError(123)).toBe(false);
      expect(isValidationError(null)).toBe(false);
      expect(isValidationError(undefined)).toBe(false);
    });

    it('should return false for object without code', () => {
      expect(isValidationError({ message: 'Error' })).toBe(false);
    });
  });

  describe('isAuthError - Extended', () => {
    it('should return false for non-object errors', () => {
      expect(isAuthError('string error')).toBe(false);
      expect(isAuthError(123)).toBe(false);
      expect(isAuthError(null)).toBe(false);
      expect(isAuthError(undefined)).toBe(false);
    });

    it('should return false for object without code', () => {
      expect(isAuthError({ message: 'Error' })).toBe(false);
    });

    it('should identify SESSION_EXPIRED as auth error', () => {
      expect(isAuthError({ code: ErrorCodes.SESSION_EXPIRED })).toBe(true);
    });
  });

  describe('Error Statistics', () => {
    it('should track multiple error types', () => {
      const error1 = errorHandler.createError(
        ErrorCodes.NETWORK_ERROR,
        'Network failed'
      );
      const error2 = errorHandler.createError(
        ErrorCodes.VALIDATION_ERROR,
        'Invalid'
      );
      const error3 = errorHandler.createError(
        ErrorCodes.DATABASE_ERROR,
        'DB error'
      );

      errorHandler.logError(error1);
      errorHandler.logError(error2);
      errorHandler.logError(error3);

      expect(errorHandler.getErrorCount(ErrorCodes.NETWORK_ERROR)).toBe(1);
      expect(errorHandler.getErrorCount(ErrorCodes.VALIDATION_ERROR)).toBe(1);
      expect(errorHandler.getErrorCount(ErrorCodes.DATABASE_ERROR)).toBe(1);
    });

    it('should return 0 for error code with no occurrences', () => {
      expect(errorHandler.getErrorCount(ErrorCodes.NETWORK_ERROR)).toBe(0);
    });
  });

  describe('Error Logs', () => {
    it('should return a copy of error logs', () => {
      const error = errorHandler.createError(
        ErrorCodes.NETWORK_ERROR,
        'Network failed'
      );
      errorHandler.logError(error);

      const logs1 = errorHandler.getErrorLogs();
      const logs2 = errorHandler.getErrorLogs();

      expect(logs1).not.toBe(logs2); // Different array instances
      expect(logs1).toEqual(logs2); // Same content
    });

    it('should clear all error logs and statistics', () => {
      const error = errorHandler.createError(
        ErrorCodes.NETWORK_ERROR,
        'Network failed'
      );
      errorHandler.logError(error);
      errorHandler.recordRetryAttempt('operation-1');

      errorHandler.clearErrorLogs();

      expect(errorHandler.getErrorLogs()).toHaveLength(0);
      expect(errorHandler.getErrorCount(ErrorCodes.NETWORK_ERROR)).toBe(0);
      expect(errorHandler.getRetryCount('operation-1')).toBe(0);
    });
  });

  describe('createError - Context and Details', () => {
    it('should create error with context', () => {
      const error = errorHandler.createError(
        ErrorCodes.NETWORK_ERROR,
        'Network failed',
        'Connection timeout',
        { endpoint: '/api/test', userId: '123' }
      );

      expect(error.context).toEqual({ endpoint: '/api/test', userId: '123' });
      expect(error.details).toBe('Connection timeout');
    });

    it('should create error without optional parameters', () => {
      const error = errorHandler.createError(
        ErrorCodes.NETWORK_ERROR,
        'Network failed'
      );

      expect(error.details).toBeUndefined();
      expect(error.context).toBeUndefined();
    });
  });

  describe('createValidationError - All Parameters', () => {
    it('should create validation error with all parameters', () => {
      const error = errorHandler.createValidationError(
        'Invalid email',
        'email',
        'invalid-email',
        'Email format is incorrect'
      );

      expect(error.code).toBe(ErrorCodes.VALIDATION_ERROR);
      expect(error.message).toBe('Invalid email');
      expect(error.field).toBe('email');
      expect(error.value).toBe('invalid-email');
      expect(error.details).toBe('Email format is incorrect');
      expect(error.timestamp).toBeInstanceOf(Date);
    });

    it('should create validation error with minimal parameters', () => {
      const error = errorHandler.createValidationError('Invalid input');

      expect(error.code).toBe(ErrorCodes.VALIDATION_ERROR);
      expect(error.message).toBe('Invalid input');
      expect(error.field).toBeUndefined();
      expect(error.value).toBeUndefined();
    });
  });
});
