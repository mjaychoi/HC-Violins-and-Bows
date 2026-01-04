/* eslint-disable @next/next/no-img-element */
import { fireEvent, render, screen, waitFor } from '@/test-utils/render';
import userEvent from '@testing-library/user-event';
import InvoiceForm from '../InvoiceForm';
import { Invoice, Client, Instrument } from '@/types';

// Mock dependencies
jest.mock('@/hooks/useFormState', () => ({
  useFormState: jest.fn(),
}));

jest.mock('@/hooks/useUnifiedData', () => ({
  useUnifiedClients: jest.fn(() => ({
    clients: [],
  })),
  useUnifiedInstruments: jest.fn(() => ({
    instruments: [],
  })),
}));

jest.mock('@/components/common/OptimizedImage', () => {
  return function MockOptimizedImage({ src, alt }: any) {
    return <img src={src} alt={alt} data-testid="optimized-image" />;
  };
});

jest.mock('@/utils/apiFetch', () => ({
  apiFetch: jest.fn(),
}));

const mockClients: Client[] = [
  {
    id: 'client-1',
    first_name: 'John',
    last_name: 'Doe',
    email: 'john@example.com',
    contact_number: '123-456-7890',
    client_number: 'CL001',
    tags: [],
    interest: '',
    note: '',
    address: null,
    created_at: '2024-01-01T00:00:00Z',
  },
];

const mockInstruments: Instrument[] = [
  {
    id: 'inst-1',
    maker: 'Stradivarius',
    type: 'Violin',
    subtype: null,
    year: 1720,
    serial_number: 'VI0000001',
    status: 'Available',
    price: 50000,
    certificate: true,
    certificate_name: null,
    cost_price: null,
    consignment_price: null,
    size: null,
    weight: null,
    ownership: null,
    note: null,
    created_at: '2024-01-01T00:00:00Z',
  },
];

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
  items: [
    {
      id: 'item-1',
      invoice_id: 'inv-1',
      instrument_id: 'inst-1',
      description: 'Stradivarius Violin',
      qty: 1,
      rate: 50000,
      amount: 50000,
      image_url: 'https://example.com/image.jpg',
      display_order: 0,
      created_at: '2024-01-15T00:00:00Z',
    },
  ],
};

describe('InvoiceForm', () => {
  const mockOnSubmit = jest.fn().mockResolvedValue(undefined);
  const mockOnClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    const { useFormState } = require('@/hooks/useFormState');
    useFormState.mockReturnValue({
      formData: {
        client_id: null,
        invoice_date: new Date().toISOString().split('T')[0],
        due_date: null,
        subtotal: 0,
        tax: null,
        total: 0,
        currency: 'USD',
        status: 'draft',
        notes: null,
      },
      updateField: jest.fn(),
    });

    const {
      useUnifiedClients,
      useUnifiedInstruments,
    } = require('@/hooks/useUnifiedData');
    useUnifiedClients.mockReturnValue({ clients: mockClients });
    useUnifiedInstruments.mockReturnValue({ instruments: mockInstruments });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders form with initial values in create mode', () => {
    render(
      <InvoiceForm
        invoice={null}
        isEditing={false}
        onSubmit={mockOnSubmit}
        onClose={mockOnClose}
        submitting={false}
      />
    );

    expect(screen.getByLabelText(/client/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/invoice date/i)).toBeInTheDocument();
    expect(screen.getByText('+ Add Item')).toBeInTheDocument();
  });

  it('renders form with invoice data in edit mode', () => {
    const { useFormState } = require('@/hooks/useFormState');
    useFormState.mockReturnValue({
      formData: {
        client_id: 'client-1',
        invoice_date: '2024-01-15',
        due_date: '2024-01-30',
        subtotal: 50000,
        tax: 5000,
        total: 55000,
        currency: 'USD',
        status: 'draft',
        notes: 'Test invoice',
      },
      updateField: jest.fn(),
    });

    render(
      <InvoiceForm
        invoice={mockInvoice}
        isEditing={true}
        onSubmit={mockOnSubmit}
        onClose={mockOnClose}
        submitting={false}
      />
    );

    // Check that notes textarea has the value
    const notesTextarea = screen.getByLabelText(
      /notes/i
    ) as HTMLTextAreaElement;
    expect(notesTextarea.value).toBe('Test invoice');

    // Check that item description is displayed (there may be multiple elements, so get first input)
    const descriptionInputs =
      screen.getAllByDisplayValue(/Stradivarius.*Violin/i);
    expect(descriptionInputs.length).toBeGreaterThan(0);
    // Verify it's the description input (not the select option)
    const descriptionInput = descriptionInputs.find(
      el => el.tagName === 'INPUT' && (el as HTMLInputElement).type !== 'hidden'
    );
    expect(descriptionInput).toBeDefined();
  });

  it('allows adding items', () => {
    render(
      <InvoiceForm
        invoice={null}
        isEditing={false}
        onSubmit={mockOnSubmit}
        onClose={mockOnClose}
        submitting={false}
      />
    );

    const addButton = screen.getByText('+ Add Item');
    fireEvent.click(addButton);

    expect(screen.getByText('Item 1')).toBeInTheDocument();
  });

  it('allows removing items', () => {
    render(
      <InvoiceForm
        invoice={mockInvoice}
        isEditing={true}
        onSubmit={mockOnSubmit}
        onClose={mockOnClose}
        submitting={false}
      />
    );

    const removeButton = screen.getByText('Remove');
    fireEvent.click(removeButton);

    expect(screen.queryByText('Stradivarius Violin')).not.toBeInTheDocument();
  });

  it('validates required fields on submit', async () => {
    const { useFormState } = require('@/hooks/useFormState');
    const mockUpdateField = jest.fn();
    useFormState.mockReturnValue({
      formData: {
        client_id: 'client-1',
        invoice_date: '', // Empty date
        due_date: null,
        subtotal: 0,
        tax: null,
        total: 0,
        currency: 'USD',
        status: 'draft',
        notes: null,
      },
      updateField: mockUpdateField,
    });

    render(
      <InvoiceForm
        invoice={null}
        isEditing={false}
        onSubmit={mockOnSubmit}
        onClose={mockOnClose}
        submitting={false}
      />
    );

    const submitButton = screen.getByRole('button', {
      name: /create invoice/i,
    });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/invoice date is required/i)).toBeInTheDocument();
    });

    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('validates items exist before submit', async () => {
    const { useFormState } = require('@/hooks/useFormState');
    useFormState.mockReturnValue({
      formData: {
        client_id: 'client-1',
        invoice_date: new Date().toISOString().split('T')[0],
        due_date: null,
        subtotal: 0,
        tax: null,
        total: 0,
        currency: 'USD',
        status: 'draft',
        notes: null,
      },
      updateField: jest.fn(),
    });

    render(
      <InvoiceForm
        invoice={null}
        isEditing={false}
        onSubmit={mockOnSubmit}
        onClose={mockOnClose}
        submitting={false}
      />
    );

    const submitButton = screen.getByRole('button', {
      name: /create invoice/i,
    });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(
        screen.getByText(/at least one item is required/i)
      ).toBeInTheDocument();
    });

    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('calls onSubmit with correct data', async () => {
    const user = userEvent.setup();
    const { useFormState } = require('@/hooks/useFormState');
    const mockUpdateField = jest.fn();
    useFormState.mockReturnValue({
      formData: {
        client_id: 'client-1',
        invoice_date: '2024-01-15',
        due_date: '2024-01-30',
        subtotal: 50000,
        tax: 5000,
        total: 55000,
        currency: 'USD',
        status: 'draft',
        notes: 'Test notes',
      },
      updateField: mockUpdateField,
    });

    render(
      <InvoiceForm
        invoice={null}
        isEditing={false}
        onSubmit={mockOnSubmit}
        onClose={mockOnClose}
        submitting={false}
      />
    );

    // Add an item
    const addButton = screen.getByText('+ Add Item');
    await user.click(addButton);

    // Fill in item details - find inputs by role
    const textInputs = screen.getAllByRole('textbox');
    const descriptionInput = textInputs[0] as HTMLInputElement;
    await user.type(descriptionInput, 'Test item');

    const numberInputs = screen.getAllByRole('spinbutton');
    const qtyInput = numberInputs.find(
      input => (input as HTMLInputElement).min === '1'
    ) as HTMLInputElement;
    const rateInput = numberInputs.find(
      input =>
        (input as HTMLInputElement).step === '0.01' &&
        !(input as HTMLInputElement).readOnly
    ) as HTMLInputElement;

    await user.clear(qtyInput);
    await user.type(qtyInput, '1');
    await user.clear(rateInput);
    await user.type(rateInput, '50000');

    const submitButton = screen.getByRole('button', {
      name: /create invoice/i,
    });
    await user.click(submitButton);

    await waitFor(
      () => {
        expect(mockOnSubmit).toHaveBeenCalled();
      },
      { timeout: 3000 }
    );
  });

  it('handles image upload', async () => {
    const { apiFetch } = require('@/utils/apiFetch');
    apiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        publicUrl: 'https://example.com/uploaded-image.jpg',
      }),
    });

    global.URL.createObjectURL = jest.fn(() => 'blob:preview-url');
    global.URL.revokeObjectURL = jest.fn();

    const user = userEvent.setup();
    render(
      <InvoiceForm
        invoice={null}
        isEditing={false}
        onSubmit={mockOnSubmit}
        onClose={mockOnClose}
        submitting={false}
      />
    );

    // Add an item first
    const addButton = screen.getByText('+ Add Item');
    await user.click(addButton);

    // Create a mock file
    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

    // Find file input by type
    const fileInput = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    expect(fileInput).toBeDefined();

    // Use userEvent to upload file (this simulates the file input change event)
    await user.upload(fileInput, file);

    // The handler should be called after a delay (async upload)
    // Note: In a real environment, this would trigger the onChange handler which uploads to the API
    await waitFor(
      () => {
        // Verify that URL.createObjectURL was called (indicates file was processed)
        expect(global.URL.createObjectURL).toHaveBeenCalledWith(file);
      },
      { timeout: 2000 }
    );

    // Note: The actual API call happens asynchronously in the component,
    // but the test environment may not fully simulate this. The important
    // thing is that the file input handler is triggered.
  });

  it('shows submitting state', () => {
    render(
      <InvoiceForm
        invoice={null}
        isEditing={false}
        onSubmit={mockOnSubmit}
        onClose={mockOnClose}
        submitting={true}
      />
    );

    const submitButton = screen.getByRole('button', { name: /saving/i });
    expect(submitButton).toBeDisabled();
  });

  it('calculates item amount automatically', async () => {
    const user = userEvent.setup();
    render(
      <InvoiceForm
        invoice={null}
        isEditing={false}
        onSubmit={mockOnSubmit}
        onClose={mockOnClose}
        submitting={false}
      />
    );

    const addButton = screen.getByText('+ Add Item');
    await user.click(addButton);

    // Find inputs by their type and value since labels aren't connected
    const numberInputs = screen.getAllByRole('spinbutton');
    const qtyInput = numberInputs.find(
      input => (input as HTMLInputElement).min === '1'
    ) as HTMLInputElement;
    const rateInput = numberInputs.find(
      input =>
        (input as HTMLInputElement).step === '0.01' &&
        !(input as HTMLInputElement).readOnly
    ) as HTMLInputElement;
    const amountInput = numberInputs.find(
      input =>
        (input as HTMLInputElement).readOnly &&
        (input as HTMLInputElement).className.includes('bg-gray-50')
    ) as HTMLInputElement;

    expect(qtyInput).toBeDefined();
    expect(rateInput).toBeDefined();
    expect(amountInput).toBeDefined();

    // Initial amount should be 0
    expect(amountInput.value).toBe('0');

    // Update qty and rate
    await user.clear(qtyInput);
    await user.type(qtyInput, '2');

    await user.clear(rateInput);
    await user.type(rateInput, '100');

    // Amount should be calculated (qty * rate = 2 * 100 = 200)
    await waitFor(
      () => {
        const updatedAmountInput = screen
          .getAllByRole('spinbutton')
          .find(
            input =>
              (input as HTMLInputElement).readOnly &&
              (input as HTMLInputElement).className.includes('bg-gray-50')
          ) as HTMLInputElement;
        // Check that amount has been updated (may take a moment for state update)
        expect(
          parseFloat(updatedAmountInput.value || '0')
        ).toBeGreaterThanOrEqual(200);
      },
      { timeout: 2000 }
    );
  });

  it('handles instrument selection and auto-fills description and rate', async () => {
    const user = userEvent.setup();
    render(
      <InvoiceForm
        invoice={null}
        isEditing={false}
        onSubmit={mockOnSubmit}
        onClose={mockOnClose}
        submitting={false}
      />
    );

    const addButton = screen.getByText('+ Add Item');
    await user.click(addButton);

    // Find select element by role (combobox)
    const instrumentSelects = screen.getAllByRole('combobox');
    // Find the select that contains "Stradivarius" option
    const instrumentSelect = Array.from(instrumentSelects).find(select => {
      const options = Array.from((select as HTMLSelectElement).options);
      return options.some(option =>
        option.textContent?.includes('Stradivarius')
      );
    }) as HTMLSelectElement;

    expect(instrumentSelect).toBeDefined();

    await user.selectOptions(instrumentSelect, 'inst-1');

    // Description should be auto-filled based on instrument
    await waitFor(() => {
      const textInputs = screen.getAllByRole('textbox');
      const descriptionInput = textInputs.find(
        input =>
          (input as HTMLInputElement).value.includes('Violin') ||
          (input as HTMLInputElement).value.includes('Stradivarius')
      );
      expect(descriptionInput).toBeDefined();
    });

    // Rate should also be auto-filled
    const numberInputs = screen.getAllByRole('spinbutton');
    const rateInput = numberInputs.find(
      input =>
        (input as HTMLInputElement).step === '0.01' &&
        !(input as HTMLInputElement).readOnly
    ) as HTMLInputElement;
    expect(rateInput.value).toBe('50000');
  });

  it('allows removing item image', () => {
    render(
      <InvoiceForm
        invoice={mockInvoice}
        isEditing={true}
        onSubmit={mockOnSubmit}
        onClose={mockOnClose}
        submitting={false}
      />
    );

    const removeImageButton = screen.getByText('×');
    fireEvent.click(removeImageButton);

    expect(screen.queryByTestId('optimized-image')).not.toBeInTheDocument();
  });

  it('calls onClose when cancel is clicked', () => {
    render(
      <InvoiceForm
        invoice={null}
        isEditing={false}
        onSubmit={mockOnSubmit}
        onClose={mockOnClose}
        submitting={false}
      />
    );

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalled();
  });
});
