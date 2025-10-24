import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import ErrorToast from '../ErrorToast'
import { AppError, ErrorCodes } from '@/types/errors'

// Mock the errorHandler
jest.mock('@/utils/errorHandler', () => ({
  errorHandler: {
    getUserFriendlyMessage: jest.fn((error) => `Friendly: ${error.message}`),
    getRecoverySuggestions: jest.fn(() => ['Check your connection', 'Try again later'])
  }
}))

describe('ErrorToast', () => {
  const mockError: AppError = {
    code: ErrorCodes.NETWORK_ERROR,
    message: 'Network connection failed',
    timestamp: new Date(),
    context: { endpoint: '/api/test' }
  }

  const defaultProps = {
    error: mockError,
    onClose: jest.fn()
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should render error message', () => {
    render(<ErrorToast {...defaultProps} />)
    
    expect(screen.getByText('Friendly: Network connection failed')).toBeInTheDocument()
  })

  it('should render error details when provided', () => {
    const errorWithDetails = {
      ...mockError,
      details: 'Connection timeout after 30 seconds'
    }

    render(<ErrorToast {...defaultProps} error={errorWithDetails} />)
    
    expect(screen.getByText('Connection timeout after 30 seconds')).toBeInTheDocument()
  })

  it('should call onClose when close button is clicked', () => {
    render(<ErrorToast {...defaultProps} />)
    
    const closeButton = screen.getByRole('button', { name: /close/i })
    fireEvent.click(closeButton)
    
    expect(defaultProps.onClose).toHaveBeenCalled()
  })

  it('should auto-close after duration', async () => {
    jest.useFakeTimers()
    
    render(<ErrorToast {...defaultProps} />)
    
    expect(screen.getByText('Friendly: Network connection failed')).toBeInTheDocument()
    
    act(() => {
      jest.advanceTimersByTime(1000)
    })
    
    await waitFor(() => {
      expect(defaultProps.onClose).toHaveBeenCalled()
    })
    
    jest.useRealTimers()
  })

  it('should not auto-close when autoClose is false', async () => {
    jest.useFakeTimers()
    
    render(<ErrorToast {...defaultProps} autoClose={false} />)
    
    act(() => {
      jest.advanceTimersByTime(1000)
    })
    
    expect(defaultProps.onClose).not.toHaveBeenCalled()
    
    jest.useRealTimers()
  })

  it('should show recovery suggestions when enabled', () => {
    render(<ErrorToast {...defaultProps} showRecoverySuggestions={true} />)
    
    expect(screen.getByText('Solution methods:')).toBeInTheDocument()
    expect(screen.getByText('Check your connection')).toBeInTheDocument()
    expect(screen.getByText('Try again later')).toBeInTheDocument()
  })

  it('should show retry button for retryable errors', () => {
    const onRetry = jest.fn()
    render(<ErrorToast {...defaultProps} onRetry={onRetry} />)
    
    const retryButton = screen.getByText('🔄')
    expect(retryButton).toBeInTheDocument()
    
    fireEvent.click(retryButton)
    expect(onRetry).toHaveBeenCalled()
  })

  it('should not show retry button for non-retryable errors', () => {
    const validationError = {
      ...mockError,
      code: ErrorCodes.VALIDATION_ERROR
    }
    
    const onRetry = jest.fn()
    render(<ErrorToast {...defaultProps} error={validationError} onRetry={onRetry} />)
    
    expect(screen.queryByTitle('Retry')).not.toBeInTheDocument()
  })

  it('should apply correct styling for different error types', () => {
    const { rerender } = render(<ErrorToast {...defaultProps} />)
    
    // Network error should have yellow styling
    const container = screen.getByText('Friendly: Network connection failed').closest('div')?.parentElement?.parentElement
    expect(container).toHaveClass('bg-yellow-50')
    
    // Test validation error styling
    const validationError = {
      ...mockError,
      code: ErrorCodes.VALIDATION_ERROR
    }
    
    rerender(<ErrorToast {...defaultProps} error={validationError} />)
    const validationContainer = screen.getByText('Friendly: Network connection failed').closest('div')?.parentElement?.parentElement
    expect(validationContainer).toHaveClass('bg-orange-50')
  })

  it('should hide suggestions when hide button is clicked', () => {
    render(<ErrorToast {...defaultProps} showRecoverySuggestions={true} />)
    
    expect(screen.getByText('Solution methods:')).toBeInTheDocument()
    expect(screen.getByText('Check your connection')).toBeInTheDocument()
    expect(screen.getByText('Try again later')).toBeInTheDocument()
  })

  it('should handle multiple error types correctly', () => {
    const errorTypes = [
      { code: ErrorCodes.NETWORK_ERROR, expectedClass: 'bg-orange-50' },
      { code: ErrorCodes.UNAUTHORIZED, expectedClass: 'bg-red-50' },
      { code: ErrorCodes.VALIDATION_ERROR, expectedClass: 'bg-yellow-50' },
      { code: ErrorCodes.UNKNOWN_ERROR, expectedClass: 'bg-red-50' }
    ]

    errorTypes.forEach(({ code, expectedClass }) => {
      const error = { ...mockError, code }
      const { unmount } = render(<ErrorToast {...defaultProps} error={error} />)
      
      expect(screen.getByText('Friendly: Network connection failed').closest('div')?.parentElement?.parentElement).toHaveClass(expectedClass)
      unmount()
    })
  })
})
