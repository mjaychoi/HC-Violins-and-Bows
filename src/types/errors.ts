// Error Types
// ✅ FIXED: timestamp를 ISO string으로 통일 (직렬화/로그/스토리지 안전)
export interface AppError {
  code: string;
  message: string;
  details?: string;
  timestamp: string; // ISO string (예: new Date().toISOString())
  context?: Record<string, unknown>;
}

export interface ApiError extends AppError {
  status?: number;
  endpoint?: string;
}

export interface ValidationError extends AppError {
  field?: string;
  value?: unknown;
}

// Error Codes
export enum ErrorCodes {
  // Network Errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',

  // Authentication Errors
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  SESSION_EXPIRED = 'SESSION_EXPIRED',

  // Database Errors
  DATABASE_ERROR = 'DATABASE_ERROR',
  RECORD_NOT_FOUND = 'RECORD_NOT_FOUND',
  DUPLICATE_RECORD = 'DUPLICATE_RECORD',

  // Validation Errors
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  REQUIRED_FIELD = 'REQUIRED_FIELD',
  INVALID_FORMAT = 'INVALID_FORMAT',

  // File Upload Errors
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  INVALID_FILE_TYPE = 'INVALID_FILE_TYPE',
  UPLOAD_FAILED = 'UPLOAD_FAILED',

  // Generic Errors
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

// Error Severity Levels
export enum ErrorSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

// Error Categories
export enum ErrorCategory {
  NETWORK = 'NETWORK',
  AUTHENTICATION = 'AUTHENTICATION',
  DATABASE = 'DATABASE',
  VALIDATION = 'VALIDATION',
  FILE_UPLOAD = 'FILE_UPLOAD',
  BUSINESS_LOGIC = 'BUSINESS_LOGIC',
  SYSTEM = 'SYSTEM',
}
