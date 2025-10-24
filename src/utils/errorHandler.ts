import { AppError, ApiError, ValidationError, ErrorCodes, ErrorSeverity, ErrorCategory } from '@/types/errors'

// Error Handler Class
export class ErrorHandler {
  private static instance: ErrorHandler
  private errorLog: AppError[] = []
  private errorStats: Map<ErrorCodes, number> = new Map()
  private retryAttempts: Map<string, number> = new Map()
  private maxRetries = 3

  static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler()
    }
    return ErrorHandler.instance
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
      context
    }
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
      endpoint
    }
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
      value
    }
  }

  // Handle Supabase errors with PostgrestError type
  handleSupabaseError(error: unknown, context?: string): AppError {
    console.error('Supabase Error:', error)
    
    let code = ErrorCodes.DATABASE_ERROR
    let message = 'Database operation failed'
    
    // Type guard for PostgrestError
    if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
      const pgError = error as { code: string; message: string; details?: string; hint?: string }
      
      switch (pgError.code) {
        case '23505': // Unique constraint violation
          code = ErrorCodes.DUPLICATE_RECORD
          message = 'Record already exists'
          break
        case '23503': // Foreign key constraint violation
          code = ErrorCodes.VALIDATION_ERROR
          message = 'Invalid reference to related record'
          break
        case 'PGRST116': // Row Level Security
          code = ErrorCodes.FORBIDDEN
          message = 'Access denied'
          break
        case 'PGRST301': // JWT expired
          code = ErrorCodes.SESSION_EXPIRED
          message = 'Session expired'
          break
        default:
          message = pgError.message || 'Database error occurred'
      }
    }

    return this.createError(code, message, (error as { details?: string }).details, { 
      context, 
      originalError: error 
    })
  }

  // Handle network errors
  handleNetworkError(error: unknown, endpoint?: string): ApiError {
    console.error('Network Error:', error)
    
    let code = ErrorCodes.NETWORK_ERROR
    let message = 'Network request failed'
    let status = 0

    if (error && typeof error === 'object' && 'name' in error && (error as { name: string }).name === 'AbortError') {
      code = ErrorCodes.TIMEOUT_ERROR
      message = 'Request timed out'
    } else if (error && typeof error === 'object' && 'response' in error) {
      const response = (error as { response: { status: number } }).response
      status = response.status
      switch (status) {
        case 401:
          code = ErrorCodes.UNAUTHORIZED
          message = 'Authentication required'
          break
        case 403:
          code = ErrorCodes.FORBIDDEN
          message = 'Access denied'
          break
        case 404:
          code = ErrorCodes.RECORD_NOT_FOUND
          message = 'Resource not found'
          break
        case 500:
          code = ErrorCodes.INTERNAL_ERROR
          message = 'Server error'
          break
        default:
          message = (error as { response: { data?: { message?: string } } }).response.data?.message || 'Request failed'
      }
    }

    return this.createApiError(code, message, status, endpoint, (error instanceof Error ? error.message : undefined))
  }

  // Get user-friendly error message
  getUserFriendlyMessage(error: AppError): string {
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
      [ErrorCodes.INTERNAL_ERROR]: 'Server error occurred.'
    }

    return messages[error.code] || error.message
  }

  // Log error with enhanced tracking
  logError(error: AppError, severity: ErrorSeverity = ErrorSeverity.MEDIUM): void {
    this.errorLog.push(error)
    
    // Update error statistics
    const currentCount = this.errorStats.get(error.code as ErrorCodes) || 0
    this.errorStats.set(error.code as ErrorCodes, currentCount + 1)
    
    // Console logging based on severity
    switch (severity) {
      case ErrorSeverity.LOW:
        console.warn('Low severity error:', error)
        break
      case ErrorSeverity.MEDIUM:
        console.error('Medium severity error:', error)
        break
      case ErrorSeverity.HIGH:
        console.error('High severity error:', error)
        break
      case ErrorSeverity.CRITICAL:
        console.error('CRITICAL ERROR:', error)
        // Send to external logging service (Sentry, LogRocket, etc.)
        this.sendToExternalLogger()
        break
    }
  }

  // Send critical errors to external logging service
  private sendToExternalLogger(): void {
    // Example integration with external services
    if (typeof window !== 'undefined') {
      // Sentry integration example
      // Sentry.captureException(new Error(error.message), {
      //   tags: { code: error.code, severity: 'critical' },
      //   extra: error.context
      // })
      
      // LogRocket integration example
      // LogRocket.captureException(new Error(error.message))
    }
  }

  // Get error logs
  getErrorLogs(): AppError[] {
    return [...this.errorLog]
  }

  // Clear error logs
  clearErrorLogs(): void {
    this.errorLog = []
    this.errorStats.clear()
    this.retryAttempts.clear()
  }

  // Get error statistics
  getErrorStats(): Map<ErrorCodes, number> {
    return new Map(this.errorStats)
  }

  // Get error count by code
  getErrorCount(code: ErrorCodes): number {
    return this.errorStats.get(code) || 0
  }

  // Check if error should be retried
  shouldRetry(error: AppError, operationId: string): boolean {
    const retryableErrors = [
      ErrorCodes.NETWORK_ERROR,
      ErrorCodes.TIMEOUT_ERROR,
      ErrorCodes.INTERNAL_ERROR
    ]
    
    if (!retryableErrors.includes(error.code as ErrorCodes)) {
      return false
    }
    
    const attempts = this.retryAttempts.get(operationId) || 0
    return attempts < this.maxRetries
  }

  // Record retry attempt
  recordRetryAttempt(operationId: string): void {
    const attempts = this.retryAttempts.get(operationId) || 0
    this.retryAttempts.set(operationId, attempts + 1)
  }

  // Clear retry attempts for operation
  clearRetryAttempts(operationId: string): void {
    this.retryAttempts.delete(operationId)
  }

  // Get retry count for operation
  getRetryCount(operationId: string): number {
    return this.retryAttempts.get(operationId) || 0
  }

  // Enhanced error recovery suggestions
  getRecoverySuggestions(error: AppError): string[] {
    const suggestions: string[] = []
    
    switch (error.code) {
      case ErrorCodes.NETWORK_ERROR:
        suggestions.push('Check your internet connection')
        suggestions.push('Please try again later')
        break
      case ErrorCodes.TIMEOUT_ERROR:
        suggestions.push('Request timeout occurred')
        suggestions.push('Check network status and try again')
        break
      case ErrorCodes.UNAUTHORIZED:
        suggestions.push('Redirecting to login page')
        break
      case ErrorCodes.FORBIDDEN:
        suggestions.push('Contact administrator for permission request')
        break
      case ErrorCodes.DATABASE_ERROR:
        suggestions.push('Check database connection')
        suggestions.push('Please try again later')
        break
      case ErrorCodes.VALIDATION_ERROR:
        suggestions.push('Please verify your input information')
        break
      case ErrorCodes.DUPLICATE_RECORD:
        suggestions.push('Data already exists')
        suggestions.push('Try with different information')
        break
      default:
        suggestions.push('Please try again later')
        suggestions.push('Contact administrator if problem persists')
    }
    
    return suggestions
  }

  // Get error category
  getErrorCategory(error: AppError): ErrorCategory {
    switch (error.code) {
      case ErrorCodes.NETWORK_ERROR:
      case ErrorCodes.TIMEOUT_ERROR:
        return ErrorCategory.NETWORK
      case ErrorCodes.UNAUTHORIZED:
      case ErrorCodes.FORBIDDEN:
      case ErrorCodes.SESSION_EXPIRED:
        return ErrorCategory.AUTHENTICATION
      case ErrorCodes.DATABASE_ERROR:
      case ErrorCodes.RECORD_NOT_FOUND:
      case ErrorCodes.DUPLICATE_RECORD:
        return ErrorCategory.DATABASE
      case ErrorCodes.VALIDATION_ERROR:
      case ErrorCodes.REQUIRED_FIELD:
      case ErrorCodes.INVALID_FORMAT:
        return ErrorCategory.VALIDATION
      case ErrorCodes.FILE_TOO_LARGE:
      case ErrorCodes.INVALID_FILE_TYPE:
      case ErrorCodes.UPLOAD_FAILED:
        return ErrorCategory.FILE_UPLOAD
      default:
        return ErrorCategory.SYSTEM
    }
  }
}

// Export singleton instance
export const errorHandler = ErrorHandler.getInstance()

// Utility functions
export const isNetworkError = (error: unknown): boolean => {
  if (error && typeof error === 'object' && 'name' in error) {
    const name = (error as { name: string }).name
    return name === 'NetworkError' || name === 'AbortError'
  }
  return !navigator.onLine
}

export const isValidationError = (error: unknown): boolean => {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code: string }).code
    return code === ErrorCodes.VALIDATION_ERROR ||
           code === ErrorCodes.REQUIRED_FIELD ||
           code === ErrorCodes.INVALID_FORMAT
  }
  return false
}

export const isAuthError = (error: unknown): boolean => {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code: string }).code
    return code === ErrorCodes.UNAUTHORIZED ||
           code === ErrorCodes.FORBIDDEN ||
           code === ErrorCodes.SESSION_EXPIRED
  }
  return false
}
