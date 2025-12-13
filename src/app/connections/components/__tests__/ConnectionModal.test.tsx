import { fireEvent, render, screen } from '@testing-library/react';
import ConnectionModal from '../ConnectionModal';
import { Client, ClientInstrument, Instrument } from '@/types';

const clients: Client[] = [
  {
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
];

const instruments: Instrument[] = [
  {
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
];

describe('ConnectionModal', () => {
  const baseProps = {
    isOpen: true,
    onClose: jest.fn(),
    onSubmit: jest.fn().mockResolvedValue(undefined),
    clients,
    items: instruments,
    selectedClient: 'c1',
    selectedInstrument: 'i1',
    relationshipType: 'Interested' as ClientInstrument['relationship_type'],
    connectionNotes: '',
    onClientChange: jest.fn(),
    onInstrumentChange: jest.fn(),
    onRelationshipTypeChange: jest.fn(),
    onNotesChange: jest.fn(),
    clientSearchTerm: '',
    onClientSearchChange: jest.fn(),
    instrumentSearchTerm: '',
    onInstrumentSearchChange: jest.fn(),
    submitting: false,
  };

  it('renders client and instrument lists', () => {
    render(<ConnectionModal {...baseProps} />);

    expect(screen.getByText('Create New Connection')).toBeInTheDocument();
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('Stradivari - Violin')).toBeInTheDocument();
  });

  it('submits when form is valid', async () => {
    const props = {
      ...baseProps,
      onClose: jest.fn(),
      onSubmit: jest.fn().mockResolvedValue(undefined),
    };
    render(<ConnectionModal {...props} />);

    fireEvent.click(screen.getByText('Create Connection'));
    await screen.findByText('Create Connection'); // wait for async
    expect(props.onSubmit).toHaveBeenCalledWith('c1', 'i1', 'Interested', '');
    expect(props.onClose).toHaveBeenCalled();
  });
});
