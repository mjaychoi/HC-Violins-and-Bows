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
import {
  getUserFriendlyErrorMessage,
  isDevelopment,
} from './errorSanitization';

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

  private toSafeOriginalError(err: unknown): Record<string, unknown> {
    if (err instanceof Error) {
      return { name: err.name, message: err.message, stack: err.stack };
    }
    if (err && typeof err === 'object') {
      const e = err as Record<string, unknown>;
      const picked: Record<string, unknown> = {};
      for (const k of [
        'code',
        'message',
        'details',
        'hint',
        'status',
        'name',
      ]) {
        if (k in e) picked[k] = e[k];
      }
      return picked;
    }
    return { value: String(err) };
  }

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
      timestamp: new Date().toISOString(),
      context,
    };
  }

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
      timestamp: new Date().toISOString(),
      status,
      endpoint,
    };
  }

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
      timestamp: new Date().toISOString(),
      field,
      value,
    };
  }

  handleSupabaseError(error: unknown, context?: string): AppError {
    let errorMessage = 'Unknown error';
    let errorCode: string | undefined;
    let errorDetails: string | undefined;

    if (error instanceof Error) {
      errorMessage = error.message || 'Unknown error';
      errorDetails = error.stack;

      if (error.name === 'PostgrestError' || error.message?.includes('PGRST')) {
        const match = error.message.match(/PGRST\d+/);
        if (match) errorCode = match[0];
      }
    } else if (error && typeof error === 'object') {
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
            originalError: this.toSafeOriginalError(error),
            preventRetry: true,
          }
        );
      }

      if (err.code === 'PGRST204' && err.message?.includes('subtype')) {
        errorMessage =
          '데이터베이스에 subtype 컬럼이 없습니다. 마이그레이션을 실행해주세요.';
        errorDetails =
          'SUBTYPE_MIGRATION_GUIDE.md 파일을 참고하여 마이그레이션을 실행하세요.';

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
        structuredLogError('Supabase Error', error, 'ErrorHandler', {
          errorCode,
          errorMessage,
          errorDetails,
        });
      }
    }

    let code = ErrorCodes.DATABASE_ERROR;
    let message =
      errorCode === 'PGRST204' && errorMessage.includes('subtype')
        ? errorMessage
        : 'Database operation failed';

    if (
      typeof error === 'object' &&
      error &&
      'status' in error &&
      'message' in error
    ) {
      const { status } = error as { status?: number };
      const msg =
        typeof (error as { message?: unknown }).message === 'string'
          ? (error as { message?: string }).message
          : undefined;

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
        message = errorMessage || msg || 'Database operation failed';
      }
    }

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
        case '23505':
          code = ErrorCodes.DUPLICATE_RECORD;
          message = 'Record already exists';
          break;
        case '23503':
          code = ErrorCodes.VALIDATION_ERROR;
          message = 'Invalid reference to related record';
          break;
        case 'PGRST116':
          code = ErrorCodes.FORBIDDEN;
          message = 'Access denied';
          break;
        case 'PGRST204':
          code = ErrorCodes.DATABASE_ERROR;
          message = pgError.message?.includes('subtype')
            ? errorMessage ||
              '데이터베이스에 subtype 컬럼이 없습니다. 마이그레이션을 실행해주세요.'
            : pgError.message || 'Database column not found';
          break;
        case 'PGRST301':
          code = ErrorCodes.SESSION_EXPIRED;
          message = 'Session expired';
          break;
        default:
          message =
            errorMessage || pgError.message || 'Database error occurred';
      }
    }

    const details =
      errorDetails ??
      (error && typeof error === 'object' && 'details' in error
        ? String((error as { details?: unknown }).details)
        : undefined);

    return this.createError(code, message, details, {
      context,
      originalError: this.toSafeOriginalError(error),
    });
  }

  handleNetworkError(error: unknown, endpoint?: string): ApiError {
    const safeOriginal = this.toSafeOriginalError(error);

    structuredLogError('Network Error', error, 'ErrorHandler', {
      endpoint,
      originalError: safeOriginal,
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

    const details = error instanceof Error ? error.message : String(error);

    // monitoring에도 safe snapshot 넣기
    captureException(
      new Error(message),
      'ErrorHandler.handleNetworkError',
      { endpoint, status, code, originalError: safeOriginal },
      ErrorSeverity.MEDIUM
    );

    return this.createApiError(code, message, status, endpoint, details);
  }

  getUserFriendlyMessage(error: AppError): string {
    if (isDevelopment()) {
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

    return getUserFriendlyErrorMessage(error);
  }

  logError(
    error: AppError,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM
  ): void {
    this.errorLog.push(error);

    const currentCount = this.errorStats.get(error.code as ErrorCodes) || 0;
    this.errorStats.set(error.code as ErrorCodes, currentCount + 1);

    const metadata = {
      errorCode: error.code,
      severity: ErrorSeverity[severity],
      errorCount: currentCount + 1,
      timestamp: new Date().toISOString(),
    };

    const errorMessage = error.message || String(error.code);

    structuredLogError(
      `[${ErrorSeverity[severity]}] ${errorMessage}`,
      error,
      'ErrorHandler',
      metadata
    );

    if (severity === ErrorSeverity.CRITICAL) {
      this.sendToExternalLogger(error);
    }
  }

  private sendToExternalLogger(error: AppError): void {
    captureException(
      error,
      'ErrorHandler',
      { code: error.code, context: error.context, details: error.details },
      ErrorSeverity.CRITICAL
    );
  }

  getErrorLogs(): AppError[] {
    return [...this.errorLog];
  }

  clearErrorLogs(): void {
    this.errorLog = [];
    this.errorStats.clear();
    this.retryAttempts.clear();
  }

  getErrorStats(): Map<ErrorCodes, number> {
    return new Map(this.errorStats);
  }

  getErrorCount(code: ErrorCodes): number {
    return this.errorStats.get(code) || 0;
  }

  shouldRetry(error: AppError, operationId: string): boolean {
    const retryableErrors = [
      ErrorCodes.NETWORK_ERROR,
      ErrorCodes.TIMEOUT_ERROR,
      ErrorCodes.INTERNAL_ERROR,
    ];

    if (
      error.context &&
      (error.context as { preventRetry?: boolean }).preventRetry
    ) {
      return false;
    }

    if (!retryableErrors.includes(error.code as ErrorCodes)) {
      return false;
    }

    const attempts = this.retryAttempts.get(operationId) || 0;
    return attempts < this.maxRetries;
  }

  recordRetryAttempt(operationId: string): void {
    const attempts = this.retryAttempts.get(operationId) || 0;
    this.retryAttempts.set(operationId, attempts + 1);
  }

  clearRetryAttempts(operationId: string): void {
    this.retryAttempts.delete(operationId);
  }

  getRetryCount(operationId: string): number {
    return this.retryAttempts.get(operationId) || 0;
  }

  getRecoverySuggestions(error: AppError): string[] {
    const suggestions: string[] = [];

    switch (error.code) {
      case ErrorCodes.NETWORK_ERROR:
        suggestions.push(
          '인터넷 연결을 확인해주세요',
          '잠시 후 다시 시도해주세요'
        );
        break;
      case ErrorCodes.TIMEOUT_ERROR:
        suggestions.push(
          '요청 시간이 초과되었습니다',
          '네트워크 상태를 확인하고 다시 시도해주세요'
        );
        break;
      case ErrorCodes.UNAUTHORIZED:
        suggestions.push('로그인이 필요합니다', '로그인 페이지로 이동합니다');
        break;
      case ErrorCodes.FORBIDDEN:
        suggestions.push(
          '이 작업을 수행할 권한이 없습니다',
          '관리자에게 권한 요청을 문의하세요'
        );
        break;
      case ErrorCodes.DATABASE_ERROR:
        suggestions.push(
          '데이터베이스 연결에 문제가 발생했습니다',
          '잠시 후 다시 시도해주세요'
        );
        break;
      case ErrorCodes.VALIDATION_ERROR:
        if ('field' in error && (error as { field?: string }).field) {
          suggestions.push(
            `"${(error as { field?: string }).field}" 필드를 확인해주세요`
          );
        }
        suggestions.push(
          error.details || '입력한 정보를 확인하고 다시 시도해주세요'
        );
        break;
      case ErrorCodes.DUPLICATE_RECORD:
        suggestions.push(
          '이미 존재하는 데이터입니다',
          '다른 정보로 시도하거나 기존 항목을 수정하세요'
        );
        break;
      case ErrorCodes.RECORD_NOT_FOUND:
        suggestions.push('요청한 항목을 찾을 수 없습니다');
        break;
      case ErrorCodes.SESSION_EXPIRED:
        suggestions.push('세션이 만료되었습니다', '다시 로그인해주세요');
        break;
      default:
        suggestions.push(
          '잠시 후 다시 시도해주세요',
          '문제가 계속되면 관리자에게 문의하세요'
        );
    }

    return suggestions;
  }

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

export const errorHandler = ErrorHandler.getInstance();

export const isNetworkError = (error: unknown): boolean => {
  if (error && typeof error === 'object' && 'name' in error) {
    const name = (error as { name: string }).name;
    return name === 'NetworkError' || name === 'AbortError';
  }
  if (typeof navigator !== 'undefined') {
    return !navigator.onLine;
  }
  return false;
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
