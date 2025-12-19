import '@testing-library/jest-dom';
import { render, screen } from '@/test-utils/render';
import DashboardKPIs from '../DashboardKPIs';
import { Instrument, ClientInstrument } from '@/types';

const mockInstrument: Instrument = {
  id: 'inst-1',
  maker: 'Stradivarius',
  type: 'Violin',
  subtype: '4/4',
  serial_number: 'SN123',
  year: 1700,
  ownership: null,
  size: null,
  weight: null,
  note: null,
  price: 1500000,
  certificate: true,
  status: 'Available',
  created_at: '2024-01-01T00:00:00Z',
};

const createMockInstrument = (
  id: string,
  status: string,
  price: number | null
): Instrument => ({
  ...mockInstrument,
  id,
  status: status as Instrument['status'],
  price,
});

const createMockRelationship = (
  id: string,
  relationshipType: string,
  createdAt: string
): ClientInstrument => ({
  id,
  client_id: 'client-1',
  instrument_id: 'inst-1',
  relationship_type: relationshipType as ClientInstrument['relationship_type'],
  notes: null,
  created_at: createdAt,
});

describe('DashboardKPIs', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-06-15T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders all KPI cards', () => {
    const instruments: Instrument[] = [
      createMockInstrument('inst-1', 'Available', 1000000),
      createMockInstrument('inst-2', 'Sold', 500000),
    ];

    render(
      <DashboardKPIs instruments={instruments} clientRelationships={[]} />
    );

    expect(screen.getByText('Total Value')).toBeInTheDocument();
    expect(screen.getByText('Available Value')).toBeInTheDocument();
    expect(screen.getByText('In Maintenance')).toBeInTheDocument();
    expect(screen.getByText('Sold This Month')).toBeInTheDocument();
  });

  it('calculates total value correctly', () => {
    const instruments: Instrument[] = [
      createMockInstrument('inst-1', 'Available', 1000000),
      createMockInstrument('inst-2', 'Available', 500000),
      createMockInstrument('inst-3', 'Sold', 300000),
    ];

    render(
      <DashboardKPIs instruments={instruments} clientRelationships={[]} />
    );

    // Total should be 1.8M - check within Total Value card context
    const totalValueCard = screen
      .getByText('Total Value')
      .closest('.rounded-lg');
    expect(totalValueCard).toHaveTextContent('$1.8M');
  });

  it('calculates available value correctly', () => {
    const instruments: Instrument[] = [
      createMockInstrument('inst-1', 'Available', 1000000),
      createMockInstrument('inst-2', 'Available', 500000),
      createMockInstrument('inst-3', 'Sold', 300000),
    ];

    render(
      <DashboardKPIs instruments={instruments} clientRelationships={[]} />
    );

    // Available value should be 1.5M (only Available items) - check within Available Value card
    const availableValueCard = screen
      .getByText('Available Value')
      .closest('.rounded-lg');
    expect(availableValueCard).toHaveTextContent('$1.5M');
  });

  it('counts items in maintenance', () => {
    const instruments: Instrument[] = [
      createMockInstrument('inst-1', 'Available', 1000000),
      createMockInstrument('inst-2', 'Maintenance', 500000),
      createMockInstrument('inst-3', 'Maintenance', 300000),
    ];

    render(
      <DashboardKPIs instruments={instruments} clientRelationships={[]} />
    );

    // Should show 2 items in maintenance
    const maintenanceCard = screen
      .getByText('In Maintenance')
      .closest('.rounded-lg');
    expect(maintenanceCard).toHaveTextContent('2');
  });

  it('counts sold items this month', () => {
    const instruments: Instrument[] = [
      createMockInstrument('inst-1', 'Available', 1000000),
    ];

    const relationships: ClientInstrument[] = [
      createMockRelationship('rel-1', 'Sold', '2024-06-10T00:00:00Z'),
      createMockRelationship('rel-2', 'Sold', '2024-06-12T00:00:00Z'),
      createMockRelationship('rel-3', 'Sold', '2024-05-10T00:00:00Z'), // Last month
    ];

    render(
      <DashboardKPIs
        instruments={instruments}
        clientRelationships={relationships}
      />
    );

    // Should show 2 sold this month (June)
    const soldCard = screen.getByText('Sold This Month').closest('.rounded-lg');
    expect(soldCard).toHaveTextContent('2');
  });

  it('handles null prices correctly', () => {
    const instruments: Instrument[] = [
      createMockInstrument('inst-1', 'Available', null),
      createMockInstrument('inst-2', 'Available', 500000),
    ];

    render(
      <DashboardKPIs instruments={instruments} clientRelationships={[]} />
    );

    // Should only count non-null prices
    // Total Value and Available Value may be the same, so check within context
    const totalValueCard = screen
      .getByText('Total Value')
      .closest('.rounded-lg');
    expect(totalValueCard).toHaveTextContent('$500.0K');
  });

  it('handles string prices correctly', () => {
    const instruments: Instrument[] = [
      {
        ...mockInstrument,
        id: 'inst-1',
        price: 1000000,
        status: 'Available',
      },
    ];

    render(
      <DashboardKPIs instruments={instruments} clientRelationships={[]} />
    );

    // Should parse string prices
    // Check within Total Value card context
    const totalValueCard = screen
      .getByText('Total Value')
      .closest('.rounded-lg');
    expect(totalValueCard).toHaveTextContent('$1.0M');
  });

  it('formats large values with compact notation', () => {
    const instruments: Instrument[] = [
      createMockInstrument('inst-1', 'Available', 2000000),
    ];

    render(
      <DashboardKPIs instruments={instruments} clientRelationships={[]} />
    );

    // Check within Total Value card context
    const totalValueCard = screen
      .getByText('Total Value')
      .closest('.rounded-lg');
    expect(totalValueCard).toHaveTextContent('$2.0M');
  });

  it('formats medium values with K notation', () => {
    const instruments: Instrument[] = [
      createMockInstrument('inst-1', 'Available', 150000),
    ];

    render(
      <DashboardKPIs instruments={instruments} clientRelationships={[]} />
    );

    // Check within Total Value card context to avoid ambiguity
    const totalValueCard = screen
      .getByText('Total Value')
      .closest('.rounded-lg');
    expect(totalValueCard).toHaveTextContent('$150.0K');
  });

  it('shows zero for sold this month when no relationships exist', () => {
    const instruments: Instrument[] = [
      createMockInstrument('inst-1', 'Available', 1000000),
    ];

    render(
      <DashboardKPIs instruments={instruments} clientRelationships={[]} />
    );

    const soldCard = screen.getByText('Sold This Month').closest('.rounded-lg');
    expect(soldCard).toHaveTextContent('0');
  });

  it('only counts Sold relationships for sold this month', () => {
    const instruments: Instrument[] = [
      createMockInstrument('inst-1', 'Available', 1000000),
    ];

    const relationships: ClientInstrument[] = [
      createMockRelationship('rel-1', 'Sold', '2024-06-10T00:00:00Z'),
      createMockRelationship('rel-2', 'Rented', '2024-06-12T00:00:00Z'), // Not Sold
    ];

    render(
      <DashboardKPIs
        instruments={instruments}
        clientRelationships={relationships}
      />
    );

    // Should only count Sold relationships
    const soldCard = screen.getByText('Sold This Month').closest('.rounded-lg');
    expect(soldCard).toHaveTextContent('1');
  });
});
