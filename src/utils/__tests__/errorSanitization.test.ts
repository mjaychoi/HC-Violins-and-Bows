import {
  isProduction,
  isDevelopment,
  maskSensitiveInfo,
  sanitizeError,
  getUserFriendlyErrorMessage,
  createSafeErrorResponse,
  createLogErrorInfo,
} from '../errorSanitization';

describe('errorSanitization', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: originalEnv,
      writable: true,
      configurable: true,
    });
  });

  describe('isProduction', () => {
    it('should return true when NODE_ENV is production', () => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'production',
        writable: true,
        configurable: true,
      });
      expect(isProduction()).toBe(true);
    });

    it('should return false when NODE_ENV is not production', () => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'development',
        writable: true,
        configurable: true,
      });
      expect(isProduction()).toBe(false);
    });
  });

  describe('isDevelopment', () => {
    it('should return true when NODE_ENV is development', () => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'development',
        writable: true,
        configurable: true,
      });
      expect(isDevelopment()).toBe(true);
    });

    it('should return false when NODE_ENV is not development', () => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'production',
        writable: true,
        configurable: true,
      });
      expect(isDevelopment()).toBe(false);
    });
  });

  describe('maskSensitiveInfo', () => {
    it('should mask API keys', () => {
      const result = maskSensitiveInfo('api_key: secret123456');
      // The entire pattern including api_key may be masked
      expect(result).not.toContain('secret123456');
      expect(result).toBeDefined();
    });

    it('should mask email addresses', () => {
      const result = maskSensitiveInfo('Contact: user@example.com');
      expect(result).not.toContain('user@example.com');
    });

    it('should mask phone numbers', () => {
      const result = maskSensitiveInfo('Phone: 123-456-7890');
      expect(result).not.toContain('123-456-7890');
    });

    it('should mask database connection strings', () => {
      const result = maskSensitiveInfo('postgresql://user:pass@host/db');
      expect(result).not.toContain('postgresql://user:pass@host/db');
    });

    it('should not mask short strings', () => {
      const result = maskSensitiveInfo('key: abc');
      expect(result).toContain('abc');
    });

    it('should return original text if no sensitive info', () => {
      const text = 'This is a normal message';
      expect(maskSensitiveInfo(text)).toBe(text);
    });
  });

  describe('sanitizeError', () => {
    it('should sanitize Error objects', () => {
      const error = new Error('api_key: secret123');
      const result = sanitizeError(error);
      expect(result.message).not.toContain('secret123');
      // The message should be sanitized (may mask api_key pattern too)
      expect(result.message).toBeDefined();
    });

    it('should sanitize error stack in production', () => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'production',
        writable: true,
        configurable: true,
      });
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at file.ts:1:1';
      const result = sanitizeError(error);
      // In production, both stack and details should be undefined (security: no stack traces in production)
      expect(result.stack).toBeUndefined();
      expect(result.details).toBeUndefined();
    });

    it('should include stack in development', () => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'development',
        writable: true,
        configurable: true,
      });
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at file.ts:1:1';
      const result = sanitizeError(error);
      // In development, stack should be included
      expect(result.stack).toBeDefined();
      expect(result.stack).toContain('Test error');
    });

    it('should sanitize string errors', () => {
      const result = sanitizeError('api_key: secret123');
      expect(result.message).not.toContain('secret123');
    });

    it('should sanitize object errors', () => {
      const error = { message: 'api_key: secret123', details: 'More info' };
      const result = sanitizeError(error);
      expect(result.message).not.toContain('secret123');
    });

    it('should handle unknown error types', () => {
      const result = sanitizeError(null);
      expect(result.message).toBe('An unexpected error occurred');
    });
  });

  describe('getUserFriendlyErrorMessage', () => {
    it('should return original message in development', () => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'development',
        writable: true,
        configurable: true,
      });
      const error = new Error('Network error occurred');
      const result = getUserFriendlyErrorMessage(error);
      expect(result).toBe('Network error occurred');
    });

    it('should return friendly message in production', () => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'production',
        writable: true,
        configurable: true,
      });
      const error = new Error('network connection failed');
      const result = getUserFriendlyErrorMessage(error);
      expect(result).toContain('Network connection');
    });

    it('should map common error patterns', () => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'production',
        writable: true,
        configurable: true,
      });
      expect(getUserFriendlyErrorMessage(new Error('timeout'))).toContain(
        'timeout'
      );
      expect(getUserFriendlyErrorMessage(new Error('unauthorized'))).toContain(
        'Authentication'
      );
      expect(getUserFriendlyErrorMessage(new Error('not found'))).toContain(
        'not found'
      );
    });

    it('should return default message for unknown errors', () => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'production',
        writable: true,
        configurable: true,
      });
      const result = getUserFriendlyErrorMessage(new Error('unknown error'));
      expect(result).toBe('An error occurred. Please try again.');
    });
  });

  describe('createSafeErrorResponse', () => {
    it('should create safe error response', () => {
      const error = new Error('api_key: secret123');
      const result = createSafeErrorResponse(error, 400);
      expect(result.statusCode).toBe(400);
      expect(result.message).not.toContain('secret123');
      expect(result.error).toBe('An error occurred');
    });

    it('should include details in development', () => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'development',
        writable: true,
        configurable: true,
      });
      const error = new Error('Test error');
      const result = createSafeErrorResponse(error);
      expect(result.details).toBeDefined();
    });

    it('should not include details in production', () => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'production',
        writable: true,
        configurable: true,
      });
      const error = new Error('Test error');
      const result = createSafeErrorResponse(error);
      expect(result.details).toBeUndefined();
    });
  });

  describe('createLogErrorInfo', () => {
    it('should create log info for Error objects', () => {
      const error = new Error('Test error');
      error.stack = 'Error stack';
      const result = createLogErrorInfo(error);
      expect(result.message).toBe('Test error');
      expect(result.stack).toBe('Error stack');
      expect(result.type).toBe('Error');
    });

    it('should create log info for string errors', () => {
      const result = createLogErrorInfo('String error');
      expect(result.message).toBe('String error');
      expect(result.type).toBe('string');
    });

    it('should create log info for object errors', () => {
      const error = { message: 'Object error', details: 'Details' };
      const result = createLogErrorInfo(error);
      expect(result.message).toBe('Object error');
      expect(result.details).toBe('Details');
    });

    it('should handle unknown error types', () => {
      const result = createLogErrorInfo(null);
      expect(result.message).toBe('Unknown error');
      expect(result.type).toBe('unknown');
    });
  });
});
