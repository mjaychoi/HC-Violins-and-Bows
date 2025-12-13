import { render, screen } from '@testing-library/react';
import { LoadingState } from '../LoadingState';

describe('LoadingState', () => {
  it('should render loading message', () => {
    render(<LoadingState />);

    expect(screen.getByText('Loading connections...')).toBeInTheDocument();
  });

  it('should have correct styling', () => {
    const { container } = render(<LoadingState />);

    const loadingContainer = container.firstChild as HTMLElement;
    expect(loadingContainer.className).toContain('flex');
    expect(loadingContainer.className).toContain('justify-center');
    expect(loadingContainer.className).toContain('items-center');
    expect(loadingContainer.className).toContain('py-12');
  });

  it('should display loading text with correct styling', () => {
    render(<LoadingState />);

    const loadingText = screen.getByText('Loading connections...');
    expect(loadingText.className).toContain('text-gray-500');
  });
});

