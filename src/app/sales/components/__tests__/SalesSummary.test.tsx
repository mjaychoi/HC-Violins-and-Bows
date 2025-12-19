import '@testing-library/jest-dom';
import { render, screen } from '@/test-utils/render';
import SalesSummary from '../SalesSummary';
import { SalesTotals } from '../../types';

describe('SalesSummary', () => {
  const mockTotals: SalesTotals = {
    revenue: 15000,
    refund: 500,
    avgTicket: 750,
    count: 20,
    refundRate: 3.2,
  };

  it('renders all primary KPI cards', () => {
    render(<SalesSummary totals={mockTotals} period="Jan 2024" />);

    expect(screen.getByText('Revenue')).toBeInTheDocument();
    expect(screen.getByText('Orders')).toBeInTheDocument();
    expect(screen.getByText('Avg. Ticket')).toBeInTheDocument();
  });

  it('displays formatted currency values', () => {
    render(<SalesSummary totals={mockTotals} period="Jan 2024" />);

    // Compact format: $15K
    expect(screen.getByText('$15.0K')).toBeInTheDocument();
  });

  it('displays order count', () => {
    render(<SalesSummary totals={mockTotals} period="Jan 2024" />);

    expect(screen.getByText('20')).toBeInTheDocument();
  });

  it('displays period information', () => {
    render(<SalesSummary totals={mockTotals} period="Jan 2024" />);

    const periodElements = screen.getAllByText('Jan 2024');
    expect(periodElements.length).toBeGreaterThan(0);
  });

  it('displays refunded amount when refund > 0', () => {
    render(<SalesSummary totals={mockTotals} period="Jan 2024" />);

    expect(screen.getByText('Refunded')).toBeInTheDocument();
    expect(screen.getByText('$500.00')).toBeInTheDocument();
  });

  it('displays refund rate when refundRate > 0', () => {
    render(<SalesSummary totals={mockTotals} period="Jan 2024" />);

    expect(screen.getByText('Refund Rate')).toBeInTheDocument();
    expect(screen.getByText('3.2%')).toBeInTheDocument();
  });

  it('does not show refund cards when refund is 0', () => {
    const totalsWithoutRefund: SalesTotals = {
      ...mockTotals,
      refund: 0,
      refundRate: 0,
    };

    render(<SalesSummary totals={totalsWithoutRefund} period="Jan 2024" />);

    expect(screen.queryByText('Refunded')).not.toBeInTheDocument();
    expect(screen.queryByText('Refund Rate')).not.toBeInTheDocument();
  });

  it('handles large revenue values with compact formatting', () => {
    const largeTotals: SalesTotals = {
      ...mockTotals,
      revenue: 1500000,
      avgTicket: 75000,
    };

    render(<SalesSummary totals={largeTotals} period="2024" />);

    // Should show $1.5M format
    expect(screen.getByText('$1.5M')).toBeInTheDocument();
  });

  it('handles zero revenue correctly', () => {
    const zeroTotals: SalesTotals = {
      revenue: 0,
      refund: 0,
      avgTicket: 0,
      count: 0,
      refundRate: 0,
    };

    render(<SalesSummary totals={zeroTotals} period="Period" />);

    // $0 may appear multiple times (revenue, avgTicket)
    const zeroDollarElements = screen.getAllByText('$0');
    expect(zeroDollarElements.length).toBeGreaterThan(0);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('displays tooltip with exact currency value', () => {
    render(<SalesSummary totals={mockTotals} period="Jan 2024" />);

    // SummaryCard should have title attribute with exact value
    const revenueCard = screen.getByText('$15.0K').closest('div');
    expect(revenueCard).toHaveAttribute('title', '$15,000.00');
  });
});
