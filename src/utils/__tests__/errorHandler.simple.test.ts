import { errorHandler } from '../errorHandler';
import { ErrorCodes } from '@/types/errors';

describe('ErrorHandler - Simple Tests', () => {
  beforeEach(() => {
    errorHandler.clearErrorLogs();
  });

  test('should create error correctly', () => {
    const error = errorHandler.createError(
      ErrorCodes.NETWORK_ERROR,
      'Test error message'
    );

    expect(error.code).toBe(ErrorCodes.NETWORK_ERROR);
    expect(error.message).toBe('Test error message');
    // ✅ FIXED: timestamp는 이제 ISO string (Date 아님)
    expect(typeof error.timestamp).toBe('string');
    expect(error.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  test('should get user friendly message', () => {
    const error = errorHandler.createError(
      ErrorCodes.NETWORK_ERROR,
      'Network failed'
    );

    const friendlyMessage = errorHandler.getUserFriendlyMessage(error);
    expect(friendlyMessage).toBe(
      'Network connection error. Please check your internet connection.'
    );
  });

  test('should provide recovery suggestions', () => {
    const error = errorHandler.createError(
      ErrorCodes.NETWORK_ERROR,
      'Network failed'
    );

    const suggestions = errorHandler.getRecoverySuggestions(error);
    // ✅ 한국어 메시지 기준으로 검증
    expect(suggestions).toContain('인터넷 연결을 확인해주세요');
    expect(suggestions).toContain('잠시 후 다시 시도해주세요');
  });

  test('should track error statistics', () => {
    const error1 = errorHandler.createError(
      ErrorCodes.NETWORK_ERROR,
      'Error 1'
    );
    const error2 = errorHandler.createError(
      ErrorCodes.NETWORK_ERROR,
      'Error 2'
    );

    errorHandler.logError(error1);
    errorHandler.logError(error2);

    expect(errorHandler.getErrorCount(ErrorCodes.NETWORK_ERROR)).toBe(2);
  });

  test('should handle retry logic', () => {
    const error = errorHandler.createError(
      ErrorCodes.NETWORK_ERROR,
      'Network failed'
    );
    const operationId = 'test-operation';

    expect(errorHandler.shouldRetry(error, operationId)).toBe(true);

    errorHandler.recordRetryAttempt(operationId);
    expect(errorHandler.getRetryCount(operationId)).toBe(1);

    errorHandler.clearRetryAttempts(operationId);
    expect(errorHandler.getRetryCount(operationId)).toBe(0);
  });
});
