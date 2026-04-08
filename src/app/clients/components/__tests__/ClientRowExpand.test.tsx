import React from 'react';
import { render, screen } from '@/test-utils/render';
import '@testing-library/jest-dom';
import { ClientRowExpand } from '../ClientRowExpand';
import { useClientSalesData } from '../../hooks/useClientKPIs';

jest.mock('../../hooks/useClientKPIs');

const mockUseClientSalesData = useClientSalesData as jest.MockedFunction<
  typeof useClientSalesData
>;

function buildSalesDataMock(
  overrides: Partial<ReturnType<typeof useClientSalesData>> = {}
): ReturnType<typeof useClientSalesData> {
  return {
    totalSpend: 0,
    purchaseCount: 0,
    lastPurchaseDate: '—',
    loading: false,
    status: 'empty',
    ...overrides,
  };
}

describe('ClientRowExpand', () => {
  const mockClientId = 'client-123';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading skeleton when loading', () => {
    mockUseClientSalesData.mockReturnValue(
      buildSalesDataMock({
        lastPurchaseDate: 'N/A',
        loading: true,
        status: 'loading',
      })
    );

    const { container } = render(
      <table>
        <tbody>
          <ClientRowExpand clientId={mockClientId} />
        </tbody>
      </table>
    );

    // Check for skeleton loader
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders sales data when loaded', () => {
    mockUseClientSalesData.mockReturnValue(
      buildSalesDataMock({
        totalSpend: 5000,
        purchaseCount: 3,
        lastPurchaseDate: '2024-01-15',
        status: 'success',
      })
    );

    render(
      <table>
        <tbody>
          <ClientRowExpand clientId={mockClientId} />
        </tbody>
      </table>
    );

    expect(screen.getByText('Total Spend')).toBeInTheDocument();
    expect(screen.getByText('$5,000')).toBeInTheDocument();
    expect(screen.getByText('Purchase Count')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Last Purchase')).toBeInTheDocument();
    expect(screen.getByText('2024-01-15')).toBeInTheDocument();
  });

  it('formats currency amounts correctly', () => {
    mockUseClientSalesData.mockReturnValue(
      buildSalesDataMock({
        totalSpend: 1234567,
        purchaseCount: 10,
        lastPurchaseDate: '2024-01-20',
        status: 'success',
      })
    );

    render(
      <table>
        <tbody>
          <ClientRowExpand clientId={mockClientId} />
        </tbody>
      </table>
    );

    expect(screen.getByText('$1,234,567')).toBeInTheDocument();
  });

  it('handles zero values', () => {
    mockUseClientSalesData.mockReturnValue(buildSalesDataMock());

    render(
      <table>
        <tbody>
          <ClientRowExpand clientId={mockClientId} />
        </tbody>
      </table>
    );

    expect(screen.getByText('$0')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('calls useClientSalesData with correct clientId', () => {
    mockUseClientSalesData.mockReturnValue(
      buildSalesDataMock({
        totalSpend: 1000,
        purchaseCount: 1,
        lastPurchaseDate: '2024-01-10',
        status: 'success',
      })
    );

    render(
      <table>
        <tbody>
          <ClientRowExpand clientId={mockClientId} />
        </tbody>
      </table>
    );

    expect(mockUseClientSalesData).toHaveBeenCalledWith(mockClientId);
  });

  it('renders correct structure with grid layout', () => {
    mockUseClientSalesData.mockReturnValue(
      buildSalesDataMock({
        totalSpend: 2000,
        purchaseCount: 2,
        lastPurchaseDate: '2024-01-12',
        status: 'success',
      })
    );

    const { container } = render(
      <table>
        <tbody>
          <ClientRowExpand clientId={mockClientId} />
        </tbody>
      </table>
    );

    // Check for grid layout
    expect(
      container.querySelector('.grid.grid-cols-1.md\\:grid-cols-3')
    ).toBeInTheDocument();

    // Check for card structure
    const cards = container.querySelectorAll('.bg-white.rounded-lg.border');
    expect(cards).toHaveLength(3);
  });

  it('renders table row structure with correct colspan', () => {
    mockUseClientSalesData.mockReturnValue(
      buildSalesDataMock({
        totalSpend: 1000,
        purchaseCount: 1,
        lastPurchaseDate: '2024-01-10',
        status: 'success',
      })
    );

    const { container } = render(
      <table>
        <tbody>
          <ClientRowExpand clientId={mockClientId} />
        </tbody>
      </table>
    );

    // Check for table row
    const row = container.querySelector('tr.bg-gray-50');
    expect(row).toBeInTheDocument();

    // Check for colspan
    const cell = container.querySelector('td[colspan="7"]');
    expect(cell).toBeInTheDocument();
  });

  it('handles large currency amounts correctly', () => {
    mockUseClientSalesData.mockReturnValue(
      buildSalesDataMock({
        totalSpend: 999999999,
        purchaseCount: 100,
        lastPurchaseDate: '2024-01-20',
        status: 'success',
      })
    );

    render(
      <table>
        <tbody>
          <ClientRowExpand clientId={mockClientId} />
        </tbody>
      </table>
    );

    // Large amount should be formatted with commas
    expect(screen.getByText('$999,999,999')).toBeInTheDocument();
  });

  it('handles negative currency amounts (if applicable)', () => {
    mockUseClientSalesData.mockReturnValue(
      buildSalesDataMock({
        totalSpend: -1000,
        purchaseCount: 5,
        lastPurchaseDate: '2024-01-15',
        status: 'success',
      })
    );

    render(
      <table>
        <tbody>
          <ClientRowExpand clientId={mockClientId} />
        </tbody>
      </table>
    );

    // Negative amount should be formatted
    expect(screen.getByText('-$1,000')).toBeInTheDocument();
  });

  it('handles empty lastPurchaseDate gracefully', () => {
    mockUseClientSalesData.mockReturnValue(
      buildSalesDataMock({
        totalSpend: 5000,
        purchaseCount: 3,
        lastPurchaseDate: '',
        status: 'success',
      })
    );

    render(
      <table>
        <tbody>
          <ClientRowExpand clientId={mockClientId} />
        </tbody>
      </table>
    );

    expect(screen.getByText('Last Purchase')).toBeInTheDocument();
    // Empty string should still render
    const lastPurchaseCell = screen
      .getByText('Last Purchase')
      .closest('div')?.parentElement;
    expect(lastPurchaseCell).toBeInTheDocument();
  });

  it('handles null lastPurchaseDate gracefully', () => {
    mockUseClientSalesData.mockReturnValue(
      buildSalesDataMock({
        totalSpend: 5000,
        purchaseCount: 3,
        lastPurchaseDate: null as any,
        status: 'success',
      })
    );

    render(
      <table>
        <tbody>
          <ClientRowExpand clientId={mockClientId} />
        </tbody>
      </table>
    );

    expect(screen.getByText('Last Purchase')).toBeInTheDocument();
  });

  it('renders loading skeleton with correct structure', () => {
    mockUseClientSalesData.mockReturnValue(
      buildSalesDataMock({
        lastPurchaseDate: 'N/A',
        loading: true,
        status: 'loading',
      })
    );

    const { container } = render(
      <table>
        <tbody>
          <ClientRowExpand clientId={mockClientId} />
        </tbody>
      </table>
    );

    // Should render as table row
    const row = container.querySelector('tr.bg-gray-50');
    expect(row).toBeInTheDocument();

    // Should have colspan
    const cell = container.querySelector('td[colspan="7"]');
    expect(cell).toBeInTheDocument();

    // Should have skeleton
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('displays all three metrics in separate cards', () => {
    mockUseClientSalesData.mockReturnValue(
      buildSalesDataMock({
        totalSpend: 7500,
        purchaseCount: 15,
        lastPurchaseDate: '2024-01-25',
        status: 'success',
      })
    );

    render(
      <table>
        <tbody>
          <ClientRowExpand clientId={mockClientId} />
        </tbody>
      </table>
    );

    // All three labels should be present
    expect(screen.getByText('Total Spend')).toBeInTheDocument();
    expect(screen.getByText('Purchase Count')).toBeInTheDocument();
    expect(screen.getByText('Last Purchase')).toBeInTheDocument();

    // All three values should be present
    expect(screen.getByText('$7,500')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('2024-01-25')).toBeInTheDocument();
  });

  it('handles very small currency amounts', () => {
    mockUseClientSalesData.mockReturnValue(
      buildSalesDataMock({
        totalSpend: 1,
        purchaseCount: 1,
        lastPurchaseDate: '2024-01-01',
        status: 'success',
      })
    );

    render(
      <table>
        <tbody>
          <ClientRowExpand clientId={mockClientId} />
        </tbody>
      </table>
    );

    expect(screen.getByText('$1')).toBeInTheDocument();
  });
});
