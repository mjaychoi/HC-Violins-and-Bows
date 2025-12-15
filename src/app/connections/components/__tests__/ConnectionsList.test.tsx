import { render, screen } from '@/test-utils/render';
import { ConnectionsList } from '../ConnectionsList';
import { ClientInstrument } from '@/types';

const connections: ClientInstrument[] = [
  {
    id: '1',
    client_id: 'c1',
    instrument_id: 'i1',
    relationship_type: 'Sold',
    notes: null,
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
      client_number: 'CL001',
      created_at: '2024-01-01',
    },
    instrument: {
      id: 'i1',
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
  },
];

describe('ConnectionsList', () => {
  it('renders a list of ConnectionCard components', () => {
    render(
      <ConnectionsList
        groupedConnections={{ Sold: connections }}
        selectedFilter={null}
        onDeleteConnection={jest.fn()}
        onEditConnection={jest.fn()}
      />
    );

    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText(/Stradivari/)).toBeInTheDocument();
  });
});
