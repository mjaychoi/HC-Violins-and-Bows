import { render, screen, fireEvent, waitFor } from '@/test-utils/render';
import ItemList from '../ItemList';
import { Instrument, ClientInstrument } from '@/types';

jest.mock('@/components/common', () => ({
  ListSkeleton: () => <div>Loading...</div>,
}));

// FIXED: ItemList now expects EnrichedInstrument (Instrument with clients array)
type EnrichedInstrument = Instrument & {
  clients: ClientInstrument[];
};

const instrument: EnrichedInstrument = {
  id: '1',
  maker: 'Strad',
  type: 'Violin',
  subtype: null,
  year: 2020,
  certificate: true,
  size: null,
  weight: null,
  price: 1234,
  ownership: null,
  note: 'Nice',
  serial_number: 'VI0000001',
  status: 'Available',
  created_at: '2024-01-01',
  clients: [], // FIXED: Add clients array to match EnrichedInstrument type
};

const relationships: ClientInstrument[] = [
  {
    id: 'r1',
    client_id: 'c1',
    instrument_id: '1',
    relationship_type: 'Interested',
    notes: null,
    created_at: '2024-01-01',
  },
];

describe('ItemList', () => {
  it('shows loading skeleton', () => {
    render(
      <ItemList
        items={[]}
        loading
        onDeleteClick={jest.fn()}
        clientRelationships={[]}
        getSortArrow={() => 'sort-neutral'}
        onSort={jest.fn()}
      />
    );
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders empty state', () => {
    render(
      <ItemList
        items={[]}
        loading={false}
        onDeleteClick={jest.fn()}
        clientRelationships={[]}
        getSortArrow={() => 'sort-neutral'}
        onSort={jest.fn()}
      />
    );
    expect(
      screen.getByText(/등록된 아이템이 없습니다|No items/i)
    ).toBeInTheDocument();
  });

  it('renders items and triggers edit/save/delete', async () => {
    const onDelete = jest.fn();
    const onUpdateItem = jest.fn().mockResolvedValue(undefined);
    render(
      <ItemList
        items={[instrument]}
        loading={false}
        onDeleteClick={onDelete}
        onUpdateItem={onUpdateItem}
        clientRelationships={relationships}
        getSortArrow={() => '↑'}
        onSort={jest.fn()}
      />
    );

    expect(screen.getByText('Strad')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    fireEvent.click(screen.getByText('Delete'));
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }));

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    fireEvent.click(screen.getByText('Edit'));
    fireEvent.change(screen.getByPlaceholderText('Maker'), {
      target: { value: 'Guarneri' },
    });
    fireEvent.click(screen.getByTitle('Save changes'));

    await waitFor(() => expect(onUpdateItem).toHaveBeenCalled());
  });
});
