import { fireEvent, render, screen } from '@testing-library/react';
import ConnectionList from '../ConnectionList';
import { ClientInstrument } from '@/types';

const connections: ClientInstrument[] = [
  {
    id: '1',
    client_id: 'c1',
    instrument_id: 'i1',
    relationship_type: 'Sold',
    notes: 'Paid in full',
    created_at: '2024-01-01',
    client: {
      id: 'c1',
      first_name: 'Jane',
      last_name: 'Doe',
      email: 'jane@example.com',
      contact_number: null,
      tags: [],
      interest: null,
      note: null,
      client_number: null,
      created_at: '2024-01-01',
    },
    instrument: {
      id: 'i1',
      maker: 'Guarneri',
      type: 'Violin',
      subtype: null,
      year: 1700,
      certificate: true,
      size: null,
      weight: null,
      price: null,
      ownership: null,
      note: null,
      serial_number: 'VI0000002',
      status: 'Sold',
      created_at: '2024-01-01',
    },
  },
];

describe('ConnectionList', () => {
  let confirmSpy: jest.SpyInstance;

  beforeEach(() => {
    confirmSpy = jest.spyOn(window, 'confirm').mockImplementation(() => true);
  });

  it('shows empty state', () => {
    render(
      <ConnectionList
        connections={[]}
        onDeleteConnection={jest.fn()}
        submitting={false}
      />
    );
    expect(screen.getByText('No Connections Found')).toBeInTheDocument();
  });

  it('renders connections and handles delete with connection object (not window.confirm)', () => {
    const onDelete = jest.fn();
    render(
      <ConnectionList
        connections={connections}
        onDeleteConnection={onDelete}
        submitting={false}
      />
    );

    expect(screen.getByText('Jane Doe ↔ Guarneri - Violin')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button'));
    // Should call onDeleteConnection with the full connection object, not just ID
    expect(onDelete).toHaveBeenCalledWith(connections[0]);
    expect(onDelete).toHaveBeenCalledTimes(1);
    
    // Should NOT use window.confirm
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('disables delete while submitting', () => {
    render(
      <ConnectionList
        connections={connections}
        onDeleteConnection={jest.fn()}
        submitting
      />
    );

    expect(screen.getByRole('button')).toBeDisabled();
  });
});
