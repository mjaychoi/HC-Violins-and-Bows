import { render, screen, fireEvent, waitFor } from '@/test-utils/render';
import ItemList from '../ItemList';
import { Instrument, ClientInstrument } from '@/types';

const mockHandleError = jest.fn();

jest.mock('@/contexts/ErrorContext', () => {
  const actual = jest.requireActual('@/contexts/ErrorContext');
  return {
    ...actual,
    useErrorContext: () => ({
      handleError: mockHandleError,
      errors: [],
      removeError: jest.fn(),
    }),
  };
});

jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: jest.fn(() => ({
    canManageInstruments: true,
  })),
}));

jest.mock('@/components/common', () => ({
  ListSkeleton: () => <div>Loading...</div>,
  EmptyState: ({
    title,
    description,
  }: {
    title?: string;
    description?: string;
  }) => (
    <div data-testid="empty-state">
      {title && <h3>{title}</h3>}
      {description && <p>{description}</p>}
    </div>
  ),
  Pagination: () => null,
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
  has_certificate: true,
  certificate_name: 'Hill Certificate',
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
  beforeEach(() => {
    jest.clearAllMocks();
  });

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
    expect(screen.getByText(/No items/i)).toBeInTheDocument();
  });

  it('renders the certificate badge from logical item metadata', () => {
    render(
      <ItemList
        items={[instrument]}
        loading={false}
        onDeleteClick={jest.fn()}
        clientRelationships={[]}
        getSortArrow={() => ''}
        onSort={jest.fn()}
      />
    );

    expect(
      screen.getAllByLabelText('Certificate: Hill Certificate').length
    ).toBeGreaterThan(0);
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

    const makers = screen.getAllByText('Strad');
    expect(makers.length).toBeGreaterThan(0);

    const moreActionsButtons = screen.getAllByRole('button', {
      name: 'More actions',
    });
    fireEvent.click(moreActionsButtons[0]);
    fireEvent.click(screen.getByText('Delete'));
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }));

    fireEvent.click(moreActionsButtons[0]);
    fireEvent.click(screen.getByText('Edit'));
    fireEvent.change(screen.getByPlaceholderText('Maker'), {
      target: { value: 'Guarneri' },
    });
    fireEvent.click(screen.getByTitle('Save changes'));

    await waitFor(() => expect(onUpdateItem).toHaveBeenCalled());
  });

  it('does not offer Reserved in inline status dropdown', async () => {
    const onUpdateItem = jest.fn().mockResolvedValue(undefined);
    render(
      <ItemList
        items={[instrument]}
        loading={false}
        onDeleteClick={jest.fn()}
        onUpdateItem={onUpdateItem}
        clientRelationships={relationships}
        getSortArrow={() => '↑'}
        onSort={jest.fn()}
      />
    );

    const moreActionsButtons = screen.getAllByRole('button', {
      name: 'More actions',
    });
    fireEvent.click(moreActionsButtons[0]);
    fireEvent.click(screen.getByText('Edit'));

    expect(
      screen.queryByRole('option', { name: 'Reserved' })
    ).not.toBeInTheDocument();
  });

  it('surfaces inline error and does not show Saved when update fails', async () => {
    const onUpdateItem = jest.fn().mockRejectedValue(new Error('save failed'));
    render(
      <ItemList
        items={[instrument]}
        loading={false}
        onDeleteClick={jest.fn()}
        onUpdateItem={onUpdateItem}
        clientRelationships={relationships}
        getSortArrow={() => '↑'}
        onSort={jest.fn()}
      />
    );

    const moreActionsButtons = screen.getAllByRole('button', {
      name: 'More actions',
    });
    fireEvent.click(moreActionsButtons[0]);
    fireEvent.click(screen.getByText('Edit'));
    fireEvent.click(screen.getByTitle('Save changes'));

    expect(await screen.findByRole('alert')).toHaveTextContent('save failed');
    expect(mockHandleError).toHaveBeenCalled();
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });

  it('shows Saved after successful inline save', async () => {
    const onUpdateItem = jest.fn().mockResolvedValue(undefined);
    render(
      <ItemList
        items={[instrument]}
        loading={false}
        onDeleteClick={jest.fn()}
        onUpdateItem={onUpdateItem}
        clientRelationships={relationships}
        getSortArrow={() => '↑'}
        onSort={jest.fn()}
      />
    );

    const moreActionsButtons = screen.getAllByRole('button', {
      name: 'More actions',
    });
    fireEvent.click(moreActionsButtons[0]);
    fireEvent.click(screen.getByText('Edit'));
    fireEvent.click(screen.getByTitle('Save changes'));

    await waitFor(() => {
      expect(screen.getByText('Saved')).toBeInTheDocument();
    });
  });

  it('renders data columns in the required order without Subtype', () => {
    render(
      <ItemList
        items={[instrument]}
        loading={false}
        onDeleteClick={jest.fn()}
        clientRelationships={relationships}
        getSortArrow={() => '↑'}
        onSort={jest.fn()}
      />
    );

    const headers = screen.getAllByRole('columnheader');
    const headerTexts = headers.map(header =>
      (header.textContent?.trim() || '').replace(/↑|↓/g, '')
    );

    expect(headerTexts).toEqual([
      '',
      'Item Number',
      'Maker',
      'Type',
      'Year',
      'Retail Price',
      'Certificate',
      'Note',
      'Status',
    ]);
    expect(headerTexts.some(text => text.includes('Subtype'))).toBe(false);
  });
});
