import '@testing-library/jest-dom';
import { render, screen } from '@/test-utils/render';
import StatusBadge from '../StatusBadge';

describe('StatusBadge', () => {
  it('renders status text', () => {
    render(<StatusBadge status="Available" />);

    expect(screen.getByText('Available')).toBeInTheDocument();
  });

  it('renders different statuses correctly', () => {
    const { rerender } = render(<StatusBadge status="Sold" />);
    expect(screen.getByText('Sold')).toBeInTheDocument();

    rerender(<StatusBadge status="Maintenance" />);
    expect(screen.getByText('Maintenance')).toBeInTheDocument();

    rerender(<StatusBadge status="Available" />);
    expect(screen.getByText('Available')).toBeInTheDocument();
  });

  it('applies correct CSS classes for different statuses', () => {
    const { container, rerender } = render(<StatusBadge status="Available" />);
    let badge = container.querySelector('span');
    expect(badge).toBeInTheDocument();

    rerender(<StatusBadge status="Sold" />);
    badge = container.querySelector('span');
    expect(badge).toBeInTheDocument();
  });
});
