import {
  AppError,
  ApiError,
  ValidationError,
  ErrorCodes,
  ErrorSeverity,
  ErrorCategory,
} from '@/types/errors';
import { logError as structuredLogError } from './logger';
import { captureException } from './monitoring';
import { getUserFriendlyErrorMessage } from './errorSanitization';

// Error Handler Class
export class ErrorHandler {
  private static instance: ErrorHandler;
  private errorLog: AppError[] = [];
  private errorStats: Map<ErrorCodes, number> = new Map();
  private retryAttempts: Map<string, number> = new Map();
  private maxRetries = 3;

  static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  // Create standardized error
  createError(
    code: ErrorCodes,
    message: string,
    details?: string,
    context?: Record<string, unknown>
  ): AppError {
    return {
      code,
      message,
      details,
      timestamp: new Date(),
      context,
    };
  }

  // Create API error
  createApiError(
    code: ErrorCodes,
    message: string,
    status?: number,
    endpoint?: string,
    details?: string
  ): ApiError {
    return {
      code,
      message,
      details,
      timestamp: new Date(),
      status,
      endpoint,
    };
  }

  // Create validation error
  createValidationError(
    message: string,
    field?: string,
    value?: unknown,
    details?: string
  ): ValidationError {
    return {
      code: ErrorCodes.VALIDATION_ERROR,
      message,
      details,
      timestamp: new Date(),
      field,
      value,
    };
  }

  // Handle Supabase errors with PostgrestError type
  handleSupabaseError(error: unknown, context?: string): AppError {
    // 에러 객체를 JSON으로 변환 시도
    let errorMessage = 'Unknown error';
    let errorCode: string | undefined;
    let errorDetails: string | undefined;

    if (error && typeof error === 'object') {
      const err = error as {
        code?: string;
        message?: string;
        details?: string;
        hint?: string;
        name?: string;
      };
      errorCode = err.code;
      errorMessage = err.message || errorMessage;
      errorDetails = err.details || err.hint;

      // Invalid Refresh Token 에러 감지 (AuthApiError)
      if (
        err.name === 'AuthApiError' ||
        errorMessage?.includes('Invalid Refresh Token') ||
        errorMessage?.includes('Refresh Token Not Found')
      ) {
        return this.createError(
          ErrorCodes.SESSION_EXPIRED,
          'Session expired. Please sign in again.',
          errorDetails,
          {
            context,
            originalError: error,
            preventRetry: true, // 무한 루프 방지 플래그
          }
        );
      }

      // 특정 에러 코드에 대한 안내 메시지 추가
      if (err.code === 'PGRST204' && err.message?.includes('subtype')) {
        errorMessage =
          '데이터베이스에 subtype 컬럼이 없습니다. 마이그레이션을 실행해주세요.';
        errorDetails =
          'SUBTYPE_MIGRATION_GUIDE.md 파일을 참고하여 마이그레이션을 실행하세요.';
        // 개발 환경에서만 상세 로그 출력
        if (process.env.NODE_ENV === 'development') {
          structuredLogError(
            'Subtype column missing. Please run migration',
            err,
            'ErrorHandler',
            {
              migrationFile: 'migration-add-subtype.sql',
              guide: 'SUBTYPE_MIGRATION_GUIDE.md',
            }
          );
        }
      } else if (process.env.NODE_ENV === 'development') {
        // 개발 환경에서만 상세 로그 출력
        structuredLogError('Supabase Error', error, 'ErrorHandler', {
          errorCode,
          errorMessage,
          errorDetails,
        });
      }
    }

    let code = ErrorCodes.DATABASE_ERROR;
    // subtype 컬럼 누락 에러는 이미 처리되었으므로 설정된 메시지 사용
    let message =
      errorCode === 'PGRST204' && errorMessage.includes('subtype')
        ? errorMessage
        : 'Database operation failed';

    // Prefer HTTP status + hint/message; fall back to code
    if (
      typeof error === 'object' &&
      error &&
      'status' in error &&
      'message' in error
    ) {
      const { status } = error as { status?: number };
      const msg =
        typeof (error as { message?: unknown }).message === 'string'
          ? ((error as { message?: string }).message as string)
          : undefined;

      // 개발 환경에서만 상세 로그 출력 (subtype 에러는 이미 처리됨)
      // 구조화된 로거는 이미 handleSupabaseError 호출 전후에 사용됨
      // 여기서는 추가 디버깅 정보만 필요시 출력

      if (status === 401) {
        code = ErrorCodes.UNAUTHORIZED;
        message = 'Authentication required';
      } else if (status === 403) {
        code = ErrorCodes.FORBIDDEN;
        message = 'Access denied';
      } else if (status === 404) {
        code = ErrorCodes.RECORD_NOT_FOUND;
        message = 'Resource not found';
      } else if (status && status >= 500) {
        code = ErrorCodes.INTERNAL_ERROR;
        message = 'Server error';
      } else if (msg?.toLowerCase().includes('duplicate key')) {
        code = ErrorCodes.DUPLICATE_RECORD;
        message = 'Record already exists';
      } else if (!errorCode || errorCode !== 'PGRST204') {
        // PGRST204가 아니고 다른 메시지가 없으면 추출한 메시지 사용
        message = errorMessage || msg || 'Database operation failed';
      }
    }

    // Type guard for PostgrestError - fallback
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      'message' in error &&
      code === ErrorCodes.DATABASE_ERROR
    ) {
      const pgError = error as {
        code: string;
        message: string;
        details?: string;
        hint?: string;
      };

      switch (pgError.code) {
        case '23505': // Unique constraint violation
          code = ErrorCodes.DUPLICATE_RECORD;
          message = 'Record already exists';
          break;
        case '23503': // Foreign key constraint violation
          code = ErrorCodes.VALIDATION_ERROR;
          message = 'Invalid reference to related record';
          break;
        case 'PGRST116': // Row Level Security
          code = ErrorCodes.FORBIDDEN;
          message = 'Access denied';
          break;
        case 'PGRST204': // Column not found in schema cache
          code = ErrorCodes.DATABASE_ERROR;
          if (pgError.message?.includes('subtype')) {
            message =
              errorMessage ||
              '데이터베이스에 subtype 컬럼이 없습니다. 마이그레이션을 실행해주세요.';
          } else {
            message = pgError.message || 'Database column not found';
          }
          break;
        case 'PGRST301': // JWT expired
          code = ErrorCodes.SESSION_EXPIRED;
          message = 'Session expired';
          break;
        default:
          message =
            errorMessage || pgError.message || 'Database error occurred';
      }
    }

    // Safe access to details property
    const details =
      error && typeof error === 'object' && 'details' in error
        ? String((error as { details?: unknown }).details)
        : undefined;

    return this.createError(code, message, details, {
      context,
      originalError: error,
    });
  }

  // Handle network errors
  handleNetworkError(error: unknown, endpoint?: string): ApiError {
    structuredLogError('Network Error', error, 'ErrorHandler', {
      endpoint,
    });

    let code = ErrorCodes.NETWORK_ERROR;
    let message = 'Network request failed';
    let status = 0;

    if (
      error &&
      typeof error === 'object' &&
      'name' in error &&
      (error as { name: string }).name === 'AbortError'
    ) {
      code = ErrorCodes.TIMEOUT_ERROR;
      message = 'Request timed out';
    } else if (error && typeof error === 'object' && 'response' in error) {
      const response = (error as { response: { status: number } }).response;
      status = response.status;
      switch (status) {
        case 401:
          code = ErrorCodes.UNAUTHORIZED;
          message = 'Authentication required';
          break;
        case 403:
          code = ErrorCodes.FORBIDDEN;
          message = 'Access denied';
          break;
        case 404:
          code = ErrorCodes.RECORD_NOT_FOUND;
          message = 'Resource not found';
          break;
        case 500:
          code = ErrorCodes.INTERNAL_ERROR;
          message = 'Server error';
          break;
        default:
          message =
            (error as { response: { data?: { message?: string } } }).response
              .data?.message || 'Request failed';
      }
    }

    return this.createApiError(
      code,
      message,
      status,
      endpoint,
      error instanceof Error ? error.message : undefined
    );
  }

  // Get user-friendly error message
  getUserFriendlyMessage(error: AppError): string {
    // 개발 환경에서는 원본 메시지 사용
    if (process.env.NODE_ENV === 'development') {
      const messages: Record<string, string> = {
        [ErrorCodes.NETWORK_ERROR]: 'Please check your network connection.',
        [ErrorCodes.TIMEOUT_ERROR]: 'Request timeout. Please try again.',
        [ErrorCodes.UNAUTHORIZED]: 'Login required.',
        [ErrorCodes.FORBIDDEN]: 'Access denied.',
        [ErrorCodes.SESSION_EXPIRED]: 'Session expired. Please login again.',
        [ErrorCodes.DATABASE_ERROR]: 'Database error occurred.',
        [ErrorCodes.RECORD_NOT_FOUND]: 'Requested data not found.',
        [ErrorCodes.DUPLICATE_RECORD]: 'Data already exists.',
        [ErrorCodes.VALIDATION_ERROR]: 'Please check your input data.',
        [ErrorCodes.REQUIRED_FIELD]: 'Please fill in required fields.',
        [ErrorCodes.INVALID_FORMAT]: 'Please enter in correct format.',
        [ErrorCodes.FILE_TOO_LARGE]: 'File size is too large.',
        [ErrorCodes.INVALID_FILE_TYPE]: 'Unsupported file type.',
        [ErrorCodes.UPLOAD_FAILED]: 'File upload failed.',
        [ErrorCodes.UNKNOWN_ERROR]: 'Unknown error occurred.',
        [ErrorCodes.INTERNAL_ERROR]: 'Server error occurred.',
      };
      return messages[error.code] || error.message;
    }

    // 프로덕션 환경에서는 sanitized 메시지 사용
    return getUserFriendlyErrorMessage(error);
  }

  // Log error with enhanced tracking
  logError(
    error: AppError,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM
  ): void {
    this.errorLog.push(error);

    // Update error statistics
    const currentCount = this.errorStats.get(error.code as ErrorCodes) || 0;
    this.errorStats.set(error.code as ErrorCodes, currentCount + 1);

    // Use structured logger
    const metadata = {
      errorCode: error.code,
      severity: ErrorSeverity[severity],
      errorCount: currentCount + 1,
      timestamp: new Date().toISOString(),
    };

    // Map severity to log level
    const errorMessage =
      error instanceof Error
        ? error.message
        : typeof error === 'object' && error !== null && 'message' in error
          ? String((error as { message: unknown }).message)
          : String(error);

    structuredLogError(
      `[${ErrorSeverity[severity]}] ${errorMessage}`,
      error,
      'ErrorHandler',
      metadata
    );

    // For critical errors, send to external logging service
    if (severity === ErrorSeverity.CRITICAL) {
      this.sendToExternalLogger(error);
    }
  }

  // Send critical errors to external logging service
  private sendToExternalLogger(error: AppError): void {
    // Use captureException for integrated error handling and alerting
    captureException(
      error,
      'ErrorHandler',
      {
        code: error.code,
        context: error.context,
        details: error.details,
      },
      ErrorSeverity.CRITICAL
    );

    // Example integration with external services (Sentry, LogRocket, etc.)
    if (typeof window !== 'undefined') {
      // Sentry integration example
      // if (window.Sentry) {
      //   window.Sentry.captureException(new Error(error.message), {
      //     tags: { code: error.code, severity: 'critical' },
      //     extra: error.context
      //   });
      // }
      // LogRocket integration example
      // if (window.LogRocket) {
      //   window.LogRocket.captureException(new Error(error.message));
      // }
    }
  }

  // Get error logs
  getErrorLogs(): AppError[] {
    return [...this.errorLog];
  }

  // Clear error logs
  clearErrorLogs(): void {
    this.errorLog = [];
    this.errorStats.clear();
    this.retryAttempts.clear();
  }

  // Get error statistics
  getErrorStats(): Map<ErrorCodes, number> {
    return new Map(this.errorStats);
  }

  // Get error count by code
  getErrorCount(code: ErrorCodes): number {
    return this.errorStats.get(code) || 0;
  }

  // Check if error should be retried
  shouldRetry(error: AppError, operationId: string): boolean {
    const retryableErrors = [
      ErrorCodes.NETWORK_ERROR,
      ErrorCodes.TIMEOUT_ERROR,
      ErrorCodes.INTERNAL_ERROR,
    ];

    if (!retryableErrors.includes(error.code as ErrorCodes)) {
      return false;
    }

    const attempts = this.retryAttempts.get(operationId) || 0;
    return attempts < this.maxRetries;
  }

  // Record retry attempt
  recordRetryAttempt(operationId: string): void {
    const attempts = this.retryAttempts.get(operationId) || 0;
    this.retryAttempts.set(operationId, attempts + 1);
  }

  // Clear retry attempts for operation
  clearRetryAttempts(operationId: string): void {
    this.retryAttempts.delete(operationId);
  }

  // Get retry count for operation
  getRetryCount(operationId: string): number {
    return this.retryAttempts.get(operationId) || 0;
  }

  // Enhanced error recovery suggestions
  getRecoverySuggestions(error: AppError): string[] {
    const suggestions: string[] = [];

    switch (error.code) {
      case ErrorCodes.NETWORK_ERROR:
        suggestions.push('Check your internet connection');
        suggestions.push('Please try again later');
        break;
      case ErrorCodes.TIMEOUT_ERROR:
        suggestions.push('Request timeout occurred');
        suggestions.push('Check network status and try again');
        break;
      case ErrorCodes.UNAUTHORIZED:
        suggestions.push('Redirecting to login page');
        break;
      case ErrorCodes.FORBIDDEN:
        suggestions.push('Contact administrator for permission request');
        break;
      case ErrorCodes.DATABASE_ERROR:
        suggestions.push('Check database connection');
        suggestions.push('Please try again later');
        break;
      case ErrorCodes.VALIDATION_ERROR:
        suggestions.push('Please verify your input information');
        break;
      case ErrorCodes.DUPLICATE_RECORD:
        suggestions.push('Data already exists');
        suggestions.push('Try with different information');
        break;
      default:
        suggestions.push('Please try again later');
        suggestions.push('Contact administrator if problem persists');
    }

    return suggestions;
  }

  // Get error category
  getErrorCategory(error: AppError): ErrorCategory {
    switch (error.code) {
      case ErrorCodes.NETWORK_ERROR:
      case ErrorCodes.TIMEOUT_ERROR:
        return ErrorCategory.NETWORK;
      case ErrorCodes.UNAUTHORIZED:
      case ErrorCodes.FORBIDDEN:
      case ErrorCodes.SESSION_EXPIRED:
        return ErrorCategory.AUTHENTICATION;
      case ErrorCodes.DATABASE_ERROR:
      case ErrorCodes.RECORD_NOT_FOUND:
      case ErrorCodes.DUPLICATE_RECORD:
        return ErrorCategory.DATABASE;
      case ErrorCodes.VALIDATION_ERROR:
      case ErrorCodes.REQUIRED_FIELD:
      case ErrorCodes.INVALID_FORMAT:
        return ErrorCategory.VALIDATION;
      case ErrorCodes.FILE_TOO_LARGE:
      case ErrorCodes.INVALID_FILE_TYPE:
      case ErrorCodes.UPLOAD_FAILED:
        return ErrorCategory.FILE_UPLOAD;
      default:
        return ErrorCategory.SYSTEM;
    }
  }
}

// Export singleton instance
export const errorHandler = ErrorHandler.getInstance();

// Utility functions
export const isNetworkError = (error: unknown): boolean => {
  if (error && typeof error === 'object' && 'name' in error) {
    const name = (error as { name: string }).name;
    return name === 'NetworkError' || name === 'AbortError';
  }
  if (typeof navigator !== 'undefined') {
    return !navigator.onLine;
  }
  return false; // SSR: don't assume offline
};

export const isValidationError = (error: unknown): boolean => {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code: string }).code;
    return (
      code === ErrorCodes.VALIDATION_ERROR ||
      code === ErrorCodes.REQUIRED_FIELD ||
      code === ErrorCodes.INVALID_FORMAT
    );
  }
  return false;
};

export const isAuthError = (error: unknown): boolean => {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code: string }).code;
    return (
      code === ErrorCodes.UNAUTHORIZED ||
      code === ErrorCodes.FORBIDDEN ||
      code === ErrorCodes.SESSION_EXPIRED
    );
  }
  return false;
};
