import '@testing-library/jest-dom';
import { render, waitFor } from '@testing-library/react';
import ClientAnalyticsPage from '../page';

// Mock next/navigation
const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({
    replace: mockReplace,
    push: jest.fn(),
    refresh: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    prefetch: jest.fn(),
  })),
}));

describe('ClientAnalyticsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReplace.mockClear();
  });

  it('redirects to /clients?tab=analytics', async () => {
    render(<ClientAnalyticsPage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/clients?tab=analytics');
    });
  });

  it('renders nothing (returns null)', () => {
    const { container } = render(<ClientAnalyticsPage />);
    expect(container.firstChild).toBeNull();
  });
});
