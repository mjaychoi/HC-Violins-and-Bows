import '@testing-library/jest-dom';
import { render, screen } from '@/test-utils/render';
import CertificateBadge from '../CertificateBadge';

describe('CertificateBadge', () => {
  it('shows Yes state when certificate exists', () => {
    render(<CertificateBadge hasCertificate={true} />);

    expect(screen.getByText('Yes')).toBeInTheDocument();
    expect(screen.getByLabelText('Certificate: Yes')).toBeInTheDocument();
    expect(screen.getByText('✓')).toBeInTheDocument();
  });

  it('shows No state when certificate is missing', () => {
    render(<CertificateBadge hasCertificate={false} />);

    expect(screen.getByText('No')).toBeInTheDocument();
    expect(screen.getByLabelText('Certificate: No')).toBeInTheDocument();
    expect(screen.getByText('✗')).toBeInTheDocument();
  });

  it('sets aria-hidden on icon for accessibility', () => {
    render(<CertificateBadge hasCertificate={true} />);
    const icon = screen.getByText('✓');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });

  it('applies base layout classes', () => {
    const { container } = render(<CertificateBadge hasCertificate={false} />);
    const badge = container.querySelector('span');
    expect(badge).toHaveClass('inline-flex', 'items-center', 'gap-1');
  });
});
