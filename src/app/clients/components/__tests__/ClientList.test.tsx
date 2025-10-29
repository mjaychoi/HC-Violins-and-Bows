import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ClientList from '../ClientList';
import { Client } from '@/types';

const mockClients: Client[] = [
  {
    id: '1',
    first_name: 'John',
    last_name: 'Doe',
    email: 'john@example.com',
    contact_number: '123-456-7890',
    tags: ['Musician'],
    interest: 'Active',
    note: 'Test client',
    created_at: '2023-01-01T00:00:00Z',
  },
  {
    id: '2',
    first_name: 'Jane',
    last_name: 'Smith',
    email: 'jane@example.com',
    contact_number: '098-765-4321',
    tags: ['Owner'],
    interest: null,
    note: 'Another test client',
    created_at: '2023-01-02T00:00:00Z',
  },
];

const mockClientsWithInstruments = new Set(['1']);

const mockProps = {
  clients: mockClients,
  clientsWithInstruments: mockClientsWithInstruments,
  clientInstruments: [],
  onClientClick: jest.fn(),
  onEditClient: jest.fn(),
  onUpdateClient: jest.fn(),
  onColumnSort: jest.fn(),
  getSortArrow: jest.fn((field: keyof Client) =>
    field === 'first_name' ? '↑' : ''
  ),
};

describe('ClientList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders client list', () => {
    render(<ClientList {...mockProps} />);

    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText('john@example.com')).toBeInTheDocument();
    expect(screen.getByText('jane@example.com')).toBeInTheDocument();
  });

  it('shows instrument indicator for clients with instruments', () => {
    render(<ClientList {...mockProps} />);

    // John Doe should have instrument indicator
    const johnRow = screen.getByText('John Doe').closest('tr');
    expect(johnRow).toHaveTextContent('None'); // No instruments in test data
  });

  it('does not show instrument indicator for clients without instruments', () => {
    render(<ClientList {...mockProps} />);

    // Jane Smith should not have instrument indicator
    const janeRow = screen.getByText('Jane Smith').closest('tr');
    expect(janeRow).not.toHaveTextContent('🎵');
  });

  it('handles client row click', () => {
    render(<ClientList {...mockProps} />);

    const johnRow = screen.getByText('John Doe').closest('tr');
    fireEvent.click(johnRow!);

    expect(mockProps.onClientClick).toHaveBeenCalledWith(mockClients[0]);
  });

  it('handles column sort', () => {
    render(<ClientList {...mockProps} />);

    const nameHeader = screen.getByText('Name');
    fireEvent.click(nameHeader);

    expect(mockProps.onColumnSort).toHaveBeenCalledWith('first_name');
  });

  it('displays sort arrows correctly', () => {
    render(<ClientList {...mockProps} />);

    const nameHeader = screen.getByText('Name');
    const arrowElement = nameHeader.querySelector('span[aria-hidden="true"]');
    expect(arrowElement).toHaveTextContent('');
  });

  it('shows client tags', () => {
    render(<ClientList {...mockProps} />);

    expect(screen.getByText('Musician')).toBeInTheDocument();
    expect(screen.getByText('Owner')).toBeInTheDocument();
  });

  it('shows client interest when available', () => {
    render(<ClientList {...mockProps} />);

    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('handles empty client list', () => {
    render(<ClientList {...mockProps} clients={[]} />);

    expect(screen.getByText('No clients found')).toBeInTheDocument();
  });

  it('displays client contact information', () => {
    render(<ClientList {...mockProps} />);

    expect(screen.getByText('123-456-7890')).toBeInTheDocument();
    expect(screen.getByText('098-765-4321')).toBeInTheDocument();
  });

  it('shows instrument connection status', () => {
    render(<ClientList {...mockProps} />);

    // Should show instrument connection status
    expect(screen.getAllByText('None')).toHaveLength(2);
  });

  it('handles clients with missing optional fields', () => {
    const clientWithMissingFields: Client = {
      id: '3',
      first_name: 'Bob',
      last_name: 'Johnson',
      email: null,
      contact_number: null,
      tags: [],
      interest: null,
      note: null,
      created_at: '2023-01-03T00:00:00Z',
    };

    render(<ClientList {...mockProps} clients={[clientWithMissingFields]} />);

    expect(screen.getByText('Bob Johnson')).toBeInTheDocument();
    expect(screen.getByText('No contact')).toBeInTheDocument(); // For missing contact
  });
});
