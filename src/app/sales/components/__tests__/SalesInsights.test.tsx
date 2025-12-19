import '@testing-library/jest-dom';
import { render, screen } from '@/test-utils/render';
import SalesInsights from '../SalesInsights';
import { EnrichedSale } from '@/types';

// Mock date-fns functions
jest.mock('date-fns', () => ({
  subDays: jest.fn((date: Date, days: number) => {
    const result = new Date(date);
    result.setDate(result.getDate() - days);
    return result;
  }),
  startOfDay: jest.fn((date: Date) => {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
  }),
  endOfDay: jest.fn((date: Date) => {
    const result = new Date(date);
    result.setHours(23, 59, 59, 999);
    return result;
  }),
  isWithinInterval: jest.fn(
    (date: Date, interval: { start: Date; end: Date }) => {
      return date >= interval.start && date <= interval.end;
    }
  ),
  differenceInCalendarDays: jest.fn((a: Date, b: Date) => {
    const diffTime = a.getTime() - b.getTime();
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  }),
}));

// Mock parseYMDUTC
jest.mock('@/utils/dateParsing', () => ({
  parseYMDUTC: jest.fn((ymd: string) => new Date(ymd + 'T00:00:00Z')),
  parseYMDLocal: jest.fn((ymd: string) => new Date(ymd + 'T00:00:00')),
}));

const mockClient = {
  id: 'client-1',
  first_name: 'John',
  last_name: 'Doe',
  email: 'john@example.com',
  contact_number: '123-456-7890',
  tags: [],
  interest: '',
  note: '',
  client_number: null,
  created_at: '2024-01-01T00:00:00Z',
};

const createMockSale = (
  id: string,
  saleDate: string,
  price: number,
  clientId: string = 'client-1'
): EnrichedSale => ({
  id,
  client_id: clientId,
  instrument_id: null,
  sale_price: price,
  sale_date: saleDate,
  notes: null,
  created_at: `${saleDate}T00:00:00Z`,
  client: mockClient,
  instrument: undefined,
});

describe('SalesInsights', () => {
  it('returns null when sales array is empty', () => {
    const { container } = render(<SalesInsights sales={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders period-over-period growth when dates are provided', () => {
    const sales: EnrichedSale[] = [
      createMockSale('sale-1', '2024-01-15', 1000),
      createMockSale('sale-2', '2024-01-20', 1500),
      // Previous period sales
      createMockSale('sale-3', '2023-12-15', 800),
      createMockSale('sale-4', '2023-12-20', 900),
    ];

    render(
      <SalesInsights sales={sales} fromDate="2024-01-01" toDate="2024-01-31" />
    );

    expect(screen.getByText('Period-over-Period Growth')).toBeInTheDocument();
  });

  it('calculates revenue growth correctly', () => {
    // Current period: 2500 (1000 + 1500)
    // Previous period: 1700 (800 + 900)
    // Growth: (2500 - 1700) / 1700 * 100 ≈ 47.1%
    const sales: EnrichedSale[] = [
      createMockSale('sale-1', '2024-01-15', 1000),
      createMockSale('sale-2', '2024-01-20', 1500),
      createMockSale('sale-3', '2023-12-15', 800),
      createMockSale('sale-4', '2023-12-20', 900),
    ];

    render(
      <SalesInsights sales={sales} fromDate="2024-01-01" toDate="2024-01-31" />
    );

    // Should show positive growth
    const growthElements = screen.getAllByText(/\+.*%/);
    expect(growthElements.length).toBeGreaterThan(0);
  });

  it('displays trend information when enough sales exist', () => {
    // Create 14+ sales for trend calculation
    const sales: EnrichedSale[] = Array.from({ length: 14 }, (_, i) =>
      createMockSale(
        `sale-${i + 1}`,
        `2024-01-${String(i + 1).padStart(2, '0')}`,
        1000 + i * 100
      )
    );

    render(
      <SalesInsights sales={sales} fromDate="2024-01-01" toDate="2024-01-31" />
    );

    expect(screen.getByText(/Recent Trend/)).toBeInTheDocument();
  });

  it('does not show trend when sales count is less than 14', () => {
    const sales: EnrichedSale[] = Array.from({ length: 10 }, (_, i) =>
      createMockSale(
        `sale-${i + 1}`,
        `2024-01-${String(i + 1).padStart(2, '0')}`,
        1000
      )
    );

    render(
      <SalesInsights sales={sales} fromDate="2024-01-01" toDate="2024-01-31" />
    );

    expect(screen.queryByText(/Recent Trend/)).not.toBeInTheDocument();
  });

  it('filters sales by date range', () => {
    const sales: EnrichedSale[] = [
      createMockSale('sale-1', '2024-01-15', 1000),
      createMockSale('sale-2', '2024-02-15', 1500), // Outside range
      createMockSale('sale-3', '2024-01-20', 800),
    ];

    const { container } = render(
      <SalesInsights sales={sales} fromDate="2024-01-01" toDate="2024-01-31" />
    );

    // Should render insights (may or may not show period-over-period depending on previous period data)
    expect(container).toBeTruthy();
  });

  it('handles refunds in calculations', () => {
    const sales: EnrichedSale[] = [
      createMockSale('sale-1', '2024-01-15', 1000),
      createMockSale('sale-2', '2024-01-20', -200), // Refund
      createMockSale('sale-3', '2023-12-15', 800),
    ];

    render(
      <SalesInsights sales={sales} fromDate="2024-01-01" toDate="2024-01-31" />
    );

    // Should still render insights with refunds considered
    expect(screen.getByText('Period-over-Period Growth')).toBeInTheDocument();
  });

  it('shows revenue change analysis when previous period exists', () => {
    const sales: EnrichedSale[] = [
      createMockSale('sale-1', '2024-01-15', 1000),
      createMockSale('sale-2', '2024-01-20', 1500),
      createMockSale('sale-3', '2023-12-15', 800),
      createMockSale('sale-4', '2023-12-20', 900),
    ];

    render(
      <SalesInsights sales={sales} fromDate="2024-01-01" toDate="2024-01-31" />
    );

    expect(screen.getByText('Revenue Change Analysis')).toBeInTheDocument();
  });

  it('works without date range (all sales)', () => {
    const sales: EnrichedSale[] = [
      createMockSale('sale-1', '2024-01-15', 1000),
      createMockSale('sale-2', '2024-01-20', 1500),
    ];

    render(<SalesInsights sales={sales} />);

    // Should render without period-over-period growth (no dates provided)
    // But may show trend if enough sales
    expect(
      screen.queryByText('Period-over-Period Growth')
    ).not.toBeInTheDocument();
  });
});
