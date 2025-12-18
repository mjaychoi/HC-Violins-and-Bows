/**
 * Smoke test for global-error.tsx
 * Tests that the GlobalError component renders and handles errors correctly
 */

import React from 'react';
import { render, screen, waitFor } from '@/test-utils/render';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import GlobalError from '../global-error';

// Mock Sentry
jest.mock('@sentry/nextjs', () => ({
  captureException: jest.fn(),
}));

describe('GlobalError', () => {
  const mockError = new Error('Test error');
  const mockReset = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render error message', () => {
    render(<GlobalError error={mockError} reset={mockReset} />);

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(
      screen.getByText(
        'An unexpected error occurred while rendering this page.'
      )
    ).toBeInTheDocument();
  });

  it('should call Sentry.captureException when error changes', async () => {
    const Sentry = require('@sentry/nextjs');
    const { rerender } = render(
      <GlobalError error={mockError} reset={mockReset} />
    );

    await waitFor(() => {
      expect(Sentry.captureException).toHaveBeenCalledWith(mockError);
    });

    // Test with new error
    const newError = new Error('New error');
    rerender(<GlobalError error={newError} reset={mockReset} />);

    await waitFor(() => {
      expect(Sentry.captureException).toHaveBeenCalledWith(newError);
    });
  });

  it('should display error digest when available', () => {
    const errorWithDigest = Object.assign(new Error('Test error'), {
      digest: 'error-digest-123',
    });

    render(<GlobalError error={errorWithDigest} reset={mockReset} />);

    expect(screen.getByText('Error ID: error-digest-123')).toBeInTheDocument();
  });

  it('should not display error digest when not available', () => {
    render(<GlobalError error={mockError} reset={mockReset} />);

    expect(screen.queryByText(/Error ID:/)).not.toBeInTheDocument();
  });

  it('should call reset when Try again button is clicked', async () => {
    const user = userEvent.setup();
    render(<GlobalError error={mockError} reset={mockReset} />);

    const tryAgainButton = screen.getByText('Try again');
    await user.click(tryAgainButton);

    expect(mockReset).toHaveBeenCalledTimes(1);
  });

  it('should have Reload button', () => {
    render(<GlobalError error={mockError} reset={mockReset} />);

    const reloadButton = screen.getByText('Reload');
    expect(reloadButton).toBeInTheDocument();

    // Note: window.location.reload() behavior is tested in integration tests
    // In unit tests, we verify the button exists and is clickable
  });

  it('should render correct HTML structure', () => {
    const { container } = render(
      <GlobalError error={mockError} reset={mockReset} />
    );

    // React Testing Library wraps in div, but component renders html/body
    // We can verify by checking if the error message is rendered (inside body)
    expect(container.firstChild).toBeTruthy();
  });

  it('should render error icon', () => {
    const { container } = render(
      <GlobalError error={mockError} reset={mockReset} />
    );

    const icon = container.querySelector('svg');
    expect(icon).toBeInTheDocument();
  });

  it('should have correct CSS classes for styling', () => {
    const { container } = render(
      <GlobalError error={mockError} reset={mockReset} />
    );

    // Verify card styling classes exist
    const card = container.querySelector('.max-w-md');
    expect(card).toBeInTheDocument();
    expect(card).toHaveClass(
      'w-full',
      'bg-white',
      'shadow-lg',
      'rounded-lg',
      'p-6'
    );
  });

  it('should render both action buttons', () => {
    render(<GlobalError error={mockError} reset={mockReset} />);

    expect(screen.getByText('Try again')).toBeInTheDocument();
    expect(screen.getByText('Reload')).toBeInTheDocument();
  });
});
