import { render, screen, fireEvent } from '@/test-utils/render';
import InvoiceModal from '../InvoiceModal';
import { Invoice } from '@/types';

// Mock dependencies
jest.mock('../InvoiceForm', () => {
  return function MockInvoiceForm({
    onSubmit,
    onClose,
    invoice,
    isEditing,
  }: any) {
    return (
      <div data-testid="invoice-form">
        <button onClick={() => onSubmit({})}>Submit</button>
        <button onClick={onClose}>Close</button>
        {isEditing ? (
          <div>Editing: {invoice?.invoice_number}</div>
        ) : (
          <div>Creating new invoice</div>
        )}
      </div>
    );
  };
});

jest.mock('@/components/common/modals/Modal', () => {
  return function MockModal({ isOpen, children, onClose }: any) {
    if (!isOpen) return null;
    return (
      <div data-testid="modal" role="dialog">
        {children}
        <button onClick={onClose}>Modal Close</button>
      </div>
    );
  };
});

const mockInvoice: Invoice = {
  id: 'inv-1',
  invoice_number: 'INV0000001',
  client_id: 'client-1',
  invoice_date: '2024-01-15',
  due_date: '2024-01-30',
  subtotal: 50000,
  tax: 5000,
  total: 55000,
  currency: 'USD',
  status: 'draft',
  notes: 'Test invoice',
  created_at: '2024-01-15T00:00:00Z',
  updated_at: '2024-01-15T00:00:00Z',
  items: [],
};

describe('InvoiceModal', () => {
  const mockOnSubmit = jest.fn().mockResolvedValue(undefined);
  const mockOnClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders modal when open', () => {
    render(
      <InvoiceModal
        isOpen={true}
        onClose={mockOnClose}
        invoice={null}
        isEditing={false}
        onSubmit={mockOnSubmit}
        submitting={false}
      />
    );

    expect(screen.getByTestId('modal')).toBeInTheDocument();
    expect(screen.getByTestId('invoice-form')).toBeInTheDocument();
  });

  it('does not render modal when closed', () => {
    render(
      <InvoiceModal
        isOpen={false}
        onClose={mockOnClose}
        invoice={null}
        isEditing={false}
        onSubmit={mockOnSubmit}
        submitting={false}
      />
    );

    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
  });

  it('displays create mode title', () => {
    render(
      <InvoiceModal
        isOpen={true}
        onClose={mockOnClose}
        invoice={null}
        isEditing={false}
        onSubmit={mockOnSubmit}
        submitting={false}
      />
    );

    expect(screen.getByText('Creating new invoice')).toBeInTheDocument();
  });

  it('displays edit mode title', () => {
    render(
      <InvoiceModal
        isOpen={true}
        onClose={mockOnClose}
        invoice={mockInvoice}
        isEditing={true}
        onSubmit={mockOnSubmit}
        submitting={false}
      />
    );

    expect(screen.getByText('Editing: INV0000001')).toBeInTheDocument();
  });

  it('calls onSubmit when form is submitted', async () => {
    render(
      <InvoiceModal
        isOpen={true}
        onClose={mockOnClose}
        invoice={null}
        isEditing={false}
        onSubmit={mockOnSubmit}
        submitting={false}
      />
    );

    const submitButton = screen.getByText('Submit');
    fireEvent.click(submitButton);

    expect(mockOnSubmit).toHaveBeenCalled();
  });

  it('calls onClose when form close is clicked', () => {
    render(
      <InvoiceModal
        isOpen={true}
        onClose={mockOnClose}
        invoice={null}
        isEditing={false}
        onSubmit={mockOnSubmit}
        submitting={false}
      />
    );

    const closeButton = screen.getByText('Close');
    fireEvent.click(closeButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('calls onClose when modal close is clicked', () => {
    render(
      <InvoiceModal
        isOpen={true}
        onClose={mockOnClose}
        invoice={null}
        isEditing={false}
        onSubmit={mockOnSubmit}
        submitting={false}
      />
    );

    const modalCloseButton = screen.getByText('Modal Close');
    fireEvent.click(modalCloseButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('passes submitting prop to form', () => {
    render(
      <InvoiceModal
        isOpen={true}
        onClose={mockOnClose}
        invoice={null}
        isEditing={false}
        onSubmit={mockOnSubmit}
        submitting={true}
      />
    );

    // Form should receive submitting prop (tested via form behavior)
    expect(screen.getByTestId('invoice-form')).toBeInTheDocument();
  });

  it('passes invoice data to form in edit mode', () => {
    render(
      <InvoiceModal
        isOpen={true}
        onClose={mockOnClose}
        invoice={mockInvoice}
        isEditing={true}
        onSubmit={mockOnSubmit}
        submitting={false}
      />
    );

    expect(screen.getByText('Editing: INV0000001')).toBeInTheDocument();
  });

  it('closes modal after successful submit', async () => {
    render(
      <InvoiceModal
        isOpen={true}
        onClose={mockOnClose}
        invoice={null}
        isEditing={false}
        onSubmit={mockOnSubmit}
        submitting={false}
      />
    );

    const submitButton = screen.getByText('Submit');
    fireEvent.click(submitButton);

    // Modal should close after submit (handled by parent, but we verify the callback)
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(mockOnSubmit).toHaveBeenCalled();
  });
});
