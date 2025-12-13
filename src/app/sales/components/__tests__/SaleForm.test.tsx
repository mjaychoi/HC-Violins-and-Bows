import '@testing-library/jest-dom';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SaleForm from '../SaleForm';
import {
  useUnifiedClients,
  useUnifiedInstruments,
} from '@/hooks/useUnifiedData';

jest.mock('@/hooks/useUnifiedData');
jest.mock('@/hooks/useOutsideClose', () => ({
  useOutsideClose: jest.fn(),
}));

const mockUseUnifiedClients = useUnifiedClients as jest.MockedFunction<
  typeof useUnifiedClients
>;
const mockUseUnifiedInstruments = useUnifiedInstruments as jest.MockedFunction<
  typeof useUnifiedInstruments
>;

const mockClient = {
  id: 'client-1',
  first_name: 'John',
  last_name: 'Doe',
  email: 'john@example.com',
  contact_number: '123-456-7890',
  tags: [],
  interest: null,
  note: null,
  client_number: 'CL0001',
  created_at: '2024-01-01T00:00:00Z',
};

const mockInstrument = {
  id: 'inst-1',
  maker: 'Stradivarius',
  type: 'Violin',
  subtype: 'Classic',
  year: 1720,
  certificate: true,
  size: '4/4',
  weight: null,
  price: 50000,
  ownership: null,
  note: null,
  serial_number: 'VI0001',
  status: 'Sold' as const,
  created_at: '2024-01-01T00:00:00Z',
};

describe('SaleForm', () => {
  const mockOnClose = jest.fn();
  const mockOnSubmit = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    jest.clearAllMocks();

    mockUseUnifiedClients.mockReturnValue({
      clients: [mockClient],
      loading: false,
      fetchClients: jest.fn(),
      createClient: jest.fn(),
      updateClient: jest.fn(),
      deleteClient: jest.fn(),
    } as any);

    mockUseUnifiedInstruments.mockReturnValue({
      instruments: [mockInstrument],
      loading: false,
      fetchInstruments: jest.fn(),
      createInstrument: jest.fn(),
      updateInstrument: jest.fn(),
      deleteInstrument: jest.fn(),
    } as any);
  });

  it('should not render when isOpen is false', () => {
    render(
      <SaleForm
        isOpen={false}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        submitting={false}
      />
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('should render modal when isOpen is true', () => {
    render(
      <SaleForm
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        submitting={false}
      />
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('New Sale')).toBeInTheDocument();
  });

  it('should focus first input when modal opens', async () => {
    render(
      <SaleForm
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        submitting={false}
      />
    );

    const priceInput = screen.getByLabelText(/Amount/i);
    await waitFor(() => {
      expect(priceInput).toHaveFocus();
    });
  });

  it('should display form fields', () => {
    render(
      <SaleForm
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        submitting={false}
      />
    );

    expect(screen.getByLabelText(/Amount/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Client/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Instrument/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Notes/i)).toBeInTheDocument();
  });

  it('should populate client dropdown', () => {
    render(
      <SaleForm
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        submitting={false}
      />
    );

    const clientSelect = screen.getByLabelText(/Client/i);
    expect(clientSelect).toBeInTheDocument();
    expect(screen.getByText(/John Doe/i)).toBeInTheDocument();
  });

  it('should populate instrument dropdown', () => {
    render(
      <SaleForm
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        submitting={false}
      />
    );

    const instrumentSelect = screen.getByLabelText(/Instrument/i);
    expect(instrumentSelect).toBeInTheDocument();
    expect(screen.getByText(/Stradivarius/i)).toBeInTheDocument();
  });

  it('should validate required fields', async () => {
    const user = userEvent.setup();
    render(
      <SaleForm
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        submitting={false}
      />
    );

    const submitButton = screen.getByText('Save Sale');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/Sale price is required/i)).toBeInTheDocument();
    });

    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('should validate sale price is non-zero (allows negative for refunds)', async () => {
    const user = userEvent.setup();
    render(
      <SaleForm
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        submitting={false}
      />
    );

    // FIXED: Test that negative values are now allowed (for refunds)
    const priceInput = screen.getByLabelText(/Amount/i) as HTMLInputElement;
    await user.clear(priceInput);
    await user.type(priceInput, '-100');
    await waitFor(() => expect(priceInput).toHaveValue(-100));

    const dateInput = screen.getByLabelText(/Date/i) as HTMLInputElement;
    // 날짜 필드는 fireEvent를 사용하는 것이 더 안정적
    fireEvent.change(dateInput, { target: { value: '2024-01-15' } });
    await waitFor(() => expect(dateInput).toHaveValue('2024-01-15'));

    const submitButton = screen.getByText('Save Sale');
    await user.click(submitButton);

    // FIXED: Now negative values are allowed, but zero is not
    await waitFor(
      () => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            sale_price: -100,
          })
        );
      },
      { timeout: 3000 }
    );
  });

  it('should reject zero sale price', async () => {
    const user = userEvent.setup();
    render(
      <SaleForm
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        submitting={false}
      />
    );

    const priceInput = screen.getByLabelText(/Amount/i) as HTMLInputElement;
    await user.clear(priceInput);
    await user.type(priceInput, '0');
    await waitFor(() => expect(priceInput).toHaveValue(0));

    const dateInput = screen.getByLabelText(/Date/i) as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2024-01-15' } });

    const submitButton = screen.getByText('Save Sale');
    await user.click(submitButton);

    await waitFor(
      () => {
        expect(
          screen.getByText(/Sale price must be a non-zero number/i)
        ).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('should submit form with valid data', async () => {
    const user = userEvent.setup();
    render(
      <SaleForm
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        submitting={false}
      />
    );

    const priceInput = screen.getByLabelText(/Amount/i) as HTMLInputElement;
    await user.type(priceInput, '2500');
    await waitFor(() => expect(priceInput).toHaveValue(2500));

    const dateInput = screen.getByLabelText(/Date/i) as HTMLInputElement;
    // Use fireEvent for date inputs as userEvent can be unreliable
    fireEvent.change(dateInput, { target: { value: '2024-01-15' } });
    await waitFor(() => expect(dateInput).toHaveValue('2024-01-15'));

    const submitButton = screen.getByText('Save Sale');
    await user.click(submitButton);

    await waitFor(
      () => {
        expect(mockOnSubmit).toHaveBeenCalledWith({
          sale_price: 2500,
          sale_date: '2024-01-15',
          client_id: null,
          instrument_id: null,
          notes: null,
        });
      },
      { timeout: 3000 }
    );

    // UX: Success message is shown instead of immediately closing
    // onClose won't be called immediately - it will be called when user clicks "Done"
    await waitFor(
      () => {
        expect(
          screen.getByText(/Sale recorded successfully/i)
        ).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
    // onClose is not called immediately - user sees success message with "Add Another" / "Done" options
  });

  it('should submit form with optional fields', async () => {
    const user = userEvent.setup();
    render(
      <SaleForm
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        submitting={false}
      />
    );

    const priceInput = screen.getByLabelText(/Amount/i) as HTMLInputElement;
    await user.clear(priceInput);
    await user.type(priceInput, '2500');
    await waitFor(() => expect(priceInput).toHaveValue(2500));

    const dateInput = screen.getByLabelText(/Date/i) as HTMLInputElement;
    // 날짜 필드는 fireEvent를 사용하는 것이 더 안정적
    fireEvent.change(dateInput, { target: { value: '2024-01-15' } });
    await waitFor(() => expect(dateInput).toHaveValue('2024-01-15'));

    const clientSelect = screen.getByLabelText(/Client/i);
    await user.selectOptions(clientSelect, 'client-1');

    const instrumentSelect = screen.getByLabelText(/Instrument/i);
    await user.selectOptions(instrumentSelect, 'inst-1');

    const notesInput = screen.getByLabelText(/Notes/i) as HTMLTextAreaElement;
    await user.clear(notesInput);
    // notes 입력: fireEvent를 사용하여 더 안정적으로 처리
    fireEvent.change(notesInput, { target: { value: 'Test notes' } });
    await waitFor(() => expect(notesInput).toHaveValue('Test notes'));

    const submitButton = screen.getByText('Save Sale');
    await user.click(submitButton);

    await waitFor(() => expect(mockOnSubmit).toHaveBeenCalled(), {
      timeout: 3000,
    });

    const payload = mockOnSubmit.mock.calls[0][0];
    expect(payload).toMatchObject({
      sale_price: 2500,
      sale_date: '2024-01-15',
      client_id: 'client-1',
      instrument_id: 'inst-1',
      notes: 'Test notes',
    });
  });

  it('should close modal when clicking cancel', async () => {
    const user = userEvent.setup();
    render(
      <SaleForm
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        submitting={false}
      />
    );

    const cancelButton = screen.getByText('Cancel');
    await user.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should close modal when clicking close button', async () => {
    const user = userEvent.setup();
    render(
      <SaleForm
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        submitting={false}
      />
    );

    const closeButton = screen.getByRole('button', { name: /close/i });
    await user.click(closeButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should disable submit button when submitting', () => {
    render(
      <SaleForm
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        submitting={true}
      />
    );

    const submitButton = screen.getByText('Saving…');
    expect(submitButton).toBeDisabled();
  });

  it('should reset form when modal closes', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <SaleForm
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        submitting={false}
      />
    );

    const priceInput = screen.getByLabelText(/Amount/i);
    await user.type(priceInput, '2500');

    // 모달 닫기
    rerender(
      <SaleForm
        isOpen={false}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        submitting={false}
      />
    );

    // 모달 다시 열기
    rerender(
      <SaleForm
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        submitting={false}
      />
    );

    // 모달이 다시 열릴 때까지 대기
    await waitFor(() => {
      const newPriceInput = screen.getByLabelText(
        /Amount/i
      ) as HTMLInputElement;
      expect(newPriceInput).toBeInTheDocument();
      expect(newPriceInput.value).toBe('');
    });
  });

  it('should handle decimal prices', async () => {
    const user = userEvent.setup();
    render(
      <SaleForm
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        submitting={false}
      />
    );

    const priceInput = screen.getByLabelText(/Amount/i) as HTMLInputElement;
    await user.type(priceInput, '1999.50');
    await waitFor(() => expect(priceInput).toHaveValue(1999.5));

    const dateInput = screen.getByLabelText(/Date/i) as HTMLInputElement;
    // 날짜 필드는 fireEvent를 사용하는 것이 더 안정적
    fireEvent.change(dateInput, { target: { value: '2024-01-15' } });
    await waitFor(() => expect(dateInput).toHaveValue('2024-01-15'));

    const submitButton = screen.getByText('Save Sale');
    await user.click(submitButton);

    await waitFor(
      () => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            sale_price: 1999.5,
          })
        );
      },
      { timeout: 3000 }
    );
  });
});
