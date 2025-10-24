import { errorHandler } from '../errorHandler'
import { ErrorCodes } from '@/types/errors'

describe('ErrorHandler - Simple Tests', () => {
  beforeEach(() => {
    errorHandler.clearErrorLogs()
  })

  test('should create error correctly', () => {
    const error = errorHandler.createError(
      ErrorCodes.NETWORK_ERROR,
      'Test error message'
    )

    expect(error.code).toBe(ErrorCodes.NETWORK_ERROR)
    expect(error.message).toBe('Test error message')
    expect(error.timestamp).toBeInstanceOf(Date)
  })

  test('should get user friendly message', () => {
    const error = errorHandler.createError(
      ErrorCodes.NETWORK_ERROR,
      'Network failed'
    )

    const friendlyMessage = errorHandler.getUserFriendlyMessage(error)
    expect(friendlyMessage).toBe('Please check your network connection.')
  })

  test('should provide recovery suggestions', () => {
    const error = errorHandler.createError(
      ErrorCodes.NETWORK_ERROR,
      'Network failed'
    )

    const suggestions = errorHandler.getRecoverySuggestions(error)
    expect(suggestions).toContain('Check your internet connection')
    expect(suggestions).toContain('Please try again later')
  })

  test('should track error statistics', () => {
    const error1 = errorHandler.createError(ErrorCodes.NETWORK_ERROR, 'Error 1')
    const error2 = errorHandler.createError(ErrorCodes.NETWORK_ERROR, 'Error 2')
    
    errorHandler.logError(error1)
    errorHandler.logError(error2)

    expect(errorHandler.getErrorCount(ErrorCodes.NETWORK_ERROR)).toBe(2)
  })

  test('should handle retry logic', () => {
    const error = errorHandler.createError(ErrorCodes.NETWORK_ERROR, 'Network failed')
    const operationId = 'test-operation'
    
    expect(errorHandler.shouldRetry(error, operationId)).toBe(true)
    
    errorHandler.recordRetryAttempt(operationId)
    expect(errorHandler.getRetryCount(operationId)).toBe(1)
    
    errorHandler.clearRetryAttempts(operationId)
    expect(errorHandler.getRetryCount(operationId)).toBe(0)
  })
})
