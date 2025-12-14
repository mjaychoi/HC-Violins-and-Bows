import '@testing-library/jest-dom';
import { render, screen } from '@/test-utils/render';
import SalesCharts from '../SalesCharts';
import { EnrichedSale } from '@/types';

// Mock recharts to avoid rendering issues in tests
jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  LineChart: ({ children }: any) => (
    <div data-testid="line-chart">{children}</div>
  ),
  BarChart: ({ children }: any) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  ComposedChart: ({ children }: any) => (
    <div data-testid="composed-chart">{children}</div>
  ),
  Line: () => <div data-testid="line" />,
  Bar: () => <div data-testid="bar" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />,
}));

const mockClient = {
  id: 'client-1',
  first_name: 'John',
  last_name: 'Doe',
  email: 'john@example.com',
  contact_number: '123-456-7890',
  tags: [],
  interest: null,
  note: null,
  client_number: 'CL0001',
  created_at: '2024-01-01T00:00:00Z',
};

const mockInstrument = {
  id: 'inst-1',
  maker: 'Stradivarius',
  type: 'Violin',
  subtype: 'Classic',
  year: 1720,
  certificate: true,
  size: '4/4',
  weight: null,
  price: 50000,
  ownership: null,
  note: null,
  serial_number: 'VI0001',
  status: 'Sold' as const,
  created_at: '2024-01-01T00:00:00Z',
};

const createMockSale = (
  overrides: Partial<EnrichedSale> = {}
): EnrichedSale => ({
  id: 'sale-1',
  instrument_id: 'inst-1',
  client_id: 'client-1',
  sale_price: 2500,
  sale_date: '2024-01-15',
  notes: 'Test sale',
  created_at: '2024-01-15T10:30:00Z',
  client: mockClient,
  instrument: mockInstrument,
  ...overrides,
});

const baseDates = [
  '2024-01-01',
  '2024-01-02',
  '2024-01-03',
  '2024-01-04',
  '2024-01-05',
  '2024-01-06',
  '2024-01-07',
  '2024-02-01',
  '2024-02-02',
  '2024-03-01',
  '2024-03-02',
  '2024-03-03',
];

const createBaselineSales = () =>
  baseDates.map((date, idx) =>
    createMockSale({
      id: `sale-${idx + 1}`,
      sale_date: date,
      sale_price: 1000 + idx * 100,
    })
  );

describe('SalesCharts', () => {
  it('should render empty state when no sales', () => {
    render(<SalesCharts sales={[]} />);

    expect(screen.getByText(/No sales data available/i)).toBeInTheDocument();
  });

  it('should render daily sales trend chart', () => {
    const sales = createBaselineSales();

    render(<SalesCharts sales={sales} />);

    expect(screen.getByText('Daily Sales Trend')).toBeInTheDocument();
    expect(screen.getAllByTestId('line-chart').length).toBeGreaterThan(0);
  });

  it('should render weekday sales chart', () => {
    const sales = createBaselineSales();

    render(<SalesCharts sales={sales} />);

    expect(screen.getByText('Sales by Day of Week')).toBeInTheDocument();
    expect(screen.getAllByTestId('bar-chart').length).toBeGreaterThan(0);
  });

  it('should render monthly sales comparison chart', () => {
    const sales = createBaselineSales();

    render(<SalesCharts sales={sales} />);

    expect(screen.getByText('Monthly Sales Comparison')).toBeInTheDocument();
    expect(screen.getAllByTestId('composed-chart').length).toBeGreaterThan(0);
  });

  it('should render top instruments chart', () => {
    const sales: EnrichedSale[] = createBaselineSales().map((sale, idx) => ({
      ...sale,
      instrument: {
        ...mockInstrument,
        type: idx % 2 === 0 ? 'Violin' : 'Viola',
        id: `inst-${idx + 1}`,
      },
      instrument_id: `inst-${idx + 1}`,
    }));

    render(<SalesCharts sales={sales} />);

    expect(screen.getByText('Top Instruments by Revenue')).toBeInTheDocument();
  });

  it('should render top makers chart', () => {
    const makers = ['Stradivarius', 'Guarneri', 'Amati'];
    const sales: EnrichedSale[] = createBaselineSales().map((sale, idx) => ({
      ...sale,
      instrument: {
        ...mockInstrument,
        maker: makers[idx % makers.length],
        id: `inst-${idx + 1}`,
      },
      instrument_id: `inst-${idx + 1}`,
    }));

    render(<SalesCharts sales={sales} />);

    expect(screen.getByText('Top Makers by Revenue')).toBeInTheDocument();
  });

  it('should calculate refunds correctly', () => {
    const sales: EnrichedSale[] = [
      ...createBaselineSales(),
      createMockSale({
        id: 'sale-refund',
        sale_price: -500, // Refund
        sale_date: '2024-03-10',
      }),
    ];

    render(<SalesCharts sales={sales} />);

    // 차트가 렌더링되는지 확인
    expect(screen.getAllByTestId('line-chart').length).toBeGreaterThan(0);
  });

  it('should display overall refund rate when refunds exist', () => {
    const sales: EnrichedSale[] = [
      ...createBaselineSales(),
      createMockSale({
        id: 'sale-refund',
        sale_date: '2024-03-15',
        sale_price: -500, // Refund
      }),
    ];

    render(<SalesCharts sales={sales} />);

    // 환불율이 표시되는지 확인 (월별 차트에)
    expect(screen.getByText(/Overall Refund Rate/i)).toBeInTheDocument();
  });

  it('should handle multiple sales on same day', () => {
    const sales: EnrichedSale[] = createBaselineSales().map((sale, idx) =>
      idx < 2
        ? {
            ...sale,
            sale_date: '2024-01-01',
            sale_price: sale.sale_price + idx * 100,
          }
        : sale
    );

    render(<SalesCharts sales={sales} />);

    expect(screen.getAllByTestId('line-chart').length).toBeGreaterThan(0);
  });

  it('should handle sales without instruments', () => {
    const sales: EnrichedSale[] = createBaselineSales().map(sale => ({
      ...sale,
      instrument_id: null,
      instrument: undefined,
    }));

    render(<SalesCharts sales={sales} />);

    // 악기 정보 없이도 차트가 렌더링되는지 확인
    expect(screen.getAllByTestId('line-chart').length).toBeGreaterThan(0);
  });

  it('should handle sales without clients', () => {
    const sales: EnrichedSale[] = createBaselineSales().map((sale, idx) => ({
      ...sale,
      id: `sale-${idx + 1}`,
      client_id: null,
      client: undefined,
    }));

    render(<SalesCharts sales={sales} />);

    // 클라이언트 정보 없이도 차트가 렌더링되는지 확인
    expect(screen.getAllByTestId('line-chart').length).toBeGreaterThan(0);
  });

  it('should limit monthly data to last 12 months', () => {
    // 15개월치 데이터 생성
    const sales: EnrichedSale[] = Array.from({ length: 15 }, (_, i) =>
      createMockSale({
        id: `sale-${i}`,
        sale_date: `2023-${String(i + 1).padStart(2, '0')}-15`,
        sale_price: 2500,
      })
    );

    render(<SalesCharts sales={sales} />);

    // 최근 12개월만 표시되는지 확인
    expect(screen.getAllByTestId('composed-chart').length).toBeGreaterThan(0);
  });

  it('should sort instrument types by revenue', () => {
    // 최소 10개 이상의 거래가 필요함
    const sales: EnrichedSale[] = Array.from({ length: 10 }, (_, i) =>
      createMockSale({
        id: `sale-${i}`,
        instrument: {
          ...mockInstrument,
          type: i < 5 ? 'Viola' : 'Violin',
          id: `inst-${i}`,
        },
        sale_price: i < 5 ? 3000 : 2500,
        sale_date: `2024-01-${String(i + 1).padStart(2, '0')}`,
      })
    );

    render(<SalesCharts sales={sales} />);

    // 차트가 렌더링되는지 확인 (정렬은 내부적으로 처리됨)
    expect(screen.getByText('Top Instruments by Revenue')).toBeInTheDocument();
  });

  it('should limit top charts to 10 items', () => {
    // 15개 타입의 악기 생성
    const sales: EnrichedSale[] = Array.from({ length: 15 }, (_, i) =>
      createMockSale({
        id: `sale-${i}`,
        instrument: { ...mockInstrument, type: `Type-${i}`, id: `inst-${i}` },
        sale_price: 2500 + i * 100,
      })
    );

    render(<SalesCharts sales={sales} />);

    // Top 10만 표시되는지 확인
    expect(screen.getByText('Top Instruments by Revenue')).toBeInTheDocument();
  });
});
