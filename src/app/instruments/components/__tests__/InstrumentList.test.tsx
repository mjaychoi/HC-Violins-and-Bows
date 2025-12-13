import { render, screen, fireEvent } from '@testing-library/react';
import InstrumentList from '../InstrumentList';

jest.mock('@/components/common', () => ({
  CardSkeleton: () => <div>Loading...</div>,
  EmptyState: ({ title, description, actionButton }: any) => (
    <div data-testid="empty-state">
      <h3>{title}</h3>
      <p>{description}</p>
      {actionButton && (
        <button onClick={actionButton.onClick}>{actionButton.label}</button>
      )}
    </div>
  ),
}));

jest.mock('next/dynamic', () => {
  return () => {
    // Mock FixedSizeList component
    const MockedFixedSizeList = ({ children, itemCount }: any) => (
      <div data-testid="fixed-size-list">
        {Array.from({ length: itemCount }, (_, i) =>
          children({ index: i, style: {} })
        )}
      </div>
    );
    return MockedFixedSizeList;
  };
});

import { Instrument } from '@/types';

const items: Instrument[] = [
  {
    id: '1',
    maker: 'Stradivari',
    type: 'Violin',
    subtype: null,
    year: 1721,
    certificate: true,
    size: null,
    weight: null,
    price: null,
    ownership: null,
    note: null,
    serial_number: 'VI0000001',
    status: 'Available',
    created_at: '2024-01-01',
  },
];

describe('InstrumentList', () => {
  it('renders skeleton when loading', () => {
    render(<InstrumentList items={[]} loading onAddInstrument={jest.fn()} />);
    expect(screen.getAllByText(/Loading/i).length).toBeGreaterThan(0);
  });

  it('renders empty state and triggers add', () => {
    const onAdd = jest.fn();
    render(
      <InstrumentList items={[]} loading={false} onAddInstrument={onAdd} />
    );

    fireEvent.click(screen.getByText(/Add Instrument|악기 추가하기/i));
    expect(onAdd).toHaveBeenCalled();
  });

  it('renders instruments list', () => {
    render(
      <InstrumentList
        items={items}
        loading={false}
        onAddInstrument={jest.fn()}
      />
    );

    expect(screen.getByText('Stradivari - Violin')).toBeInTheDocument();
    expect(screen.getByText(/Year: 1721/)).toBeInTheDocument();
    expect(screen.getByText('View Details').closest('a')).toHaveAttribute(
      'href',
      '/instruments/1'
    );
  });
});
