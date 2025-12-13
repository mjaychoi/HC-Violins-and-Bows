import { render, screen } from '@testing-library/react';
import { CustomerDetail } from '../CustomerDetail';
import { CustomerWithPurchases } from '../../types';

const mockCustomer: CustomerWithPurchases = {
  id: 'c1',
  first_name: 'John',
  last_name: 'Doe',
  email: 'john@example.com',
  contact_number: '010-1234-5678',
  tags: ['VIP', 'Musician'],
  interest: 'High',
  note: 'Prefers Italian instruments',
  client_number: 'CL001',
  created_at: '2024-01-01',
  purchases: [],
};

describe('CustomerDetail', () => {
  it('should render message when customer is null', () => {
    render(<CustomerDetail customer={null} />);
    expect(
      screen.getByText('Select a customer to view details')
    ).toBeInTheDocument();
  });

  it('should render customer name', () => {
    render(<CustomerDetail customer={mockCustomer} />);
    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });

  it('should render customer email', () => {
    render(<CustomerDetail customer={mockCustomer} />);
    expect(screen.getByText('john@example.com')).toBeInTheDocument();
  });

  it('should render customer contact number', () => {
    render(<CustomerDetail customer={mockCustomer} />);
    expect(screen.getByText('010-1234-5678')).toBeInTheDocument();
  });

  it('should render client number', () => {
    render(<CustomerDetail customer={mockCustomer} />);
    expect(screen.getByText('CL001')).toBeInTheDocument();
  });

  it('should render interest', () => {
    render(<CustomerDetail customer={mockCustomer} />);
    expect(screen.getByText(/Interest: High/i)).toBeInTheDocument();
  });

  it('should render tags', () => {
    render(<CustomerDetail customer={mockCustomer} />);
    expect(screen.getByText('VIP')).toBeInTheDocument();
    expect(screen.getByText('Musician')).toBeInTheDocument();
  });

  it('should render "No tags" when tags array is empty', () => {
    const customerWithoutTags = { ...mockCustomer, tags: [] };
    render(<CustomerDetail customer={customerWithoutTags} />);
    expect(screen.getByText('No tags')).toBeInTheDocument();
  });

  it('should render note', () => {
    render(<CustomerDetail customer={mockCustomer} />);
    expect(screen.getByText('Prefers Italian instruments')).toBeInTheDocument();
  });

  it('should render "—" when note is null', () => {
    const customerWithoutNote = { ...mockCustomer, note: null };
    render(<CustomerDetail customer={customerWithoutNote} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('should handle missing first_name', () => {
    const customerWithoutFirstName = { ...mockCustomer, first_name: null };
    render(<CustomerDetail customer={customerWithoutFirstName} />);
    expect(screen.getByText('Doe')).toBeInTheDocument();
  });

  it('should handle missing last_name', () => {
    const customerWithoutLastName = { ...mockCustomer, last_name: null };
    render(<CustomerDetail customer={customerWithoutLastName} />);
    expect(screen.getByText('John')).toBeInTheDocument();
  });

  it('should render "Unnamed" when both names are missing', () => {
    const customerWithoutNames = {
      ...mockCustomer,
      first_name: null,
      last_name: null,
    };
    render(<CustomerDetail customer={customerWithoutNames} />);
    expect(screen.getByText('Unnamed')).toBeInTheDocument();
  });

  it('should render "No email" when email is null', () => {
    const customerWithoutEmail = { ...mockCustomer, email: null };
    render(<CustomerDetail customer={customerWithoutEmail} />);
    expect(screen.getByText('No email')).toBeInTheDocument();
  });

  it('should render "No contact" when contact_number is null', () => {
    const customerWithoutContact = { ...mockCustomer, contact_number: null };
    render(<CustomerDetail customer={customerWithoutContact} />);
    expect(screen.getByText('No contact')).toBeInTheDocument();
  });

  it('should render "N/A" when client_number is null', () => {
    const customerWithoutClientNumber = {
      ...mockCustomer,
      client_number: null,
    };
    render(<CustomerDetail customer={customerWithoutClientNumber} />);
    expect(screen.getByText('N/A')).toBeInTheDocument();
  });
});
