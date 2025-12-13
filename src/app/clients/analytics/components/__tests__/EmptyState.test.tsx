import { render, screen } from '@testing-library/react';
import { EmptyState } from '../EmptyState';

describe('EmptyState', () => {
  it('should render message', () => {
    render(<EmptyState message="No customers found" />);
    expect(screen.getByText('No customers found')).toBeInTheDocument();
  });

  it('should render with different messages', () => {
    const { rerender } = render(<EmptyState message="No customers found" />);
    expect(screen.getByText('No customers found')).toBeInTheDocument();

    rerender(<EmptyState message="No results" />);
    expect(screen.getByText('No results')).toBeInTheDocument();
  });

  it('should have correct styling classes', () => {
    const { container } = render(<EmptyState message="Test message" />);
    const element = container.firstChild;
    expect(element).toHaveClass(
      'border',
      'rounded-lg',
      'p-6',
      'text-center',
      'text-gray-500',
      'bg-white',
      'shadow-sm'
    );
  });
});
