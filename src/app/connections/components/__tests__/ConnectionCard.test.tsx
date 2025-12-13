import { fireEvent, render, screen } from '@testing-library/react';
import { ConnectionCard } from '../ConnectionCard';
import { ClientInstrument } from '@/types';

const connection: ClientInstrument = {
  id: 'c1',
  client_id: 'client1',
  instrument_id: 'inst1',
  relationship_type: 'Interested',
  notes: 'Interested in upgrades',
  created_at: '2024-01-01',
  client: {
    id: 'client1',
    first_name: 'Jane',
    last_name: 'Doe',
    email: 'jane@example.com',
    contact_number: null,
    tags: ['Owner', 'Collector'],
    interest: null,
    note: null,
    client_number: null,
    created_at: '2024-01-01',
  },
  instrument: {
    id: 'inst1',
    maker: 'Stradivari',
    type: 'Violin',
    subtype: null,
    year: 1721,
    certificate: true,
    size: null,
    weight: null,
    price: 1000000,
    ownership: null,
    note: null,
    serial_number: 'VI0000001',
    status: 'Available',
    created_at: '2024-01-01',
  },
};

describe('ConnectionCard', () => {
  it('renders connection details and triggers actions', () => {
    const onDelete = jest.fn();
    const onEdit = jest.fn();

    render(
      <ConnectionCard
        connection={connection}
        onDelete={onDelete}
        onEdit={onEdit}
      />
    );

    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText(/Stradivari/)).toBeInTheDocument();
    expect(screen.getByText(/Interested in upgrades/)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Edit connection'));
    expect(onEdit).toHaveBeenCalledWith(connection);

    fireEvent.click(screen.getByLabelText('Delete connection'));
    // Should call onDelete with the full connection object, not just ID
    expect(onDelete).toHaveBeenCalledWith(connection);
    expect(onDelete).not.toHaveBeenCalledWith('c1');
  });
});
