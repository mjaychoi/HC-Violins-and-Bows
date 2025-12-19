import '@testing-library/jest-dom';
import { render, screen } from '@/test-utils/render';
import CertificateBadge from '../CertificateBadge';

describe('CertificateBadge', () => {
  it('renders "Yes" badge when certificate is true', () => {
    render(<CertificateBadge certificate={true} />);

    expect(screen.getByText('Yes')).toBeInTheDocument();
    expect(screen.getByLabelText('Certificate: Yes')).toBeInTheDocument();
    expect(screen.getByText('✓')).toBeInTheDocument();
  });

  it('renders "No" badge when certificate is false', () => {
    render(<CertificateBadge certificate={false} />);

    expect(screen.getByText('No')).toBeInTheDocument();
    expect(screen.getByLabelText('Certificate: No')).toBeInTheDocument();
    expect(screen.getByText('✗')).toBeInTheDocument();
  });

  it('renders "Unknown" badge when certificate is null', () => {
    render(<CertificateBadge certificate={null} />);

    expect(screen.getByText('Unknown')).toBeInTheDocument();
    expect(screen.getByLabelText('Certificate: Unknown')).toBeInTheDocument();
    expect(screen.getByText('?')).toBeInTheDocument();
  });

  it('renders "Unknown" badge when certificate is undefined', () => {
    render(<CertificateBadge certificate={undefined} />);

    expect(screen.getByText('Unknown')).toBeInTheDocument();
    expect(screen.getByLabelText('Certificate: Unknown')).toBeInTheDocument();
    expect(screen.getByText('?')).toBeInTheDocument();
  });

  it('renders "Unknown" badge when certificate prop is not provided', () => {
    render(<CertificateBadge />);

    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('has correct aria-label and title attributes', () => {
    render(<CertificateBadge certificate={true} />);

    const badge = screen.getByLabelText('Certificate: Yes');
    expect(badge).toHaveAttribute('title', 'Certificate: Yes');
  });

  it('has aria-hidden on icon for accessibility', () => {
    render(<CertificateBadge certificate={true} />);

    const icon = screen.getByText('✓');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });

  it('applies correct CSS classes', () => {
    const { container } = render(<CertificateBadge certificate={true} />);

    const badge = container.querySelector('span');
    expect(badge).toHaveClass('inline-flex', 'items-center', 'gap-1');
  });
});
