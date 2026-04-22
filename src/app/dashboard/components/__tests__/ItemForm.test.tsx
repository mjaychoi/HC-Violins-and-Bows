import { fireEvent, render, screen, waitFor } from '@/test-utils/render';
import ItemForm from '../ItemForm';
import { useDashboardForm } from '../../hooks/useDashboardForm';
import { generateInstrumentSerialNumber } from '@/utils/uniqueNumberGenerator';

jest.mock('../../hooks/useDashboardForm', () => ({
  useDashboardForm: jest.fn(),
}));

jest.mock('@/utils/uniqueNumberGenerator', () => ({
  generateInstrumentSerialNumber: jest.fn(() => 'VI0000001'),
  normalizeInstrumentSerial: jest.requireActual('@/utils/uniqueNumberGenerator')
    .normalizeInstrumentSerial,
  validateInstrumentSerial: jest.requireActual('@/utils/uniqueNumberGenerator')
    .validateInstrumentSerial,
}));

const baseFormState = {
  formData: {
    status: 'Available',
    maker: '',
    type: '',
    subtype: '',
    year: '',
    price: '',
    certificate: false,
    certificate_name: '',
    size: '',
    weight: '',
    ownership: '',
    note: '',
    serial_number: '',
  },
  updateField: jest.fn(),
  resetForm: jest.fn(),

  priceInput: '',
  handlePriceChange: jest.fn(),

  costPriceInput: '',
  handleCostPriceChange: jest.fn(),

  consignmentPriceInput: '',
  handleConsignmentPriceChange: jest.fn(),

  selectedFiles: [],
  handleFileChange: jest.fn(),
  removeFile: jest.fn(),
};

const createdInstrumentStub = {
  id: 'new-inst-1',
  maker: 'Strad',
  type: 'Violin',
  subtype: null,
  serial_number: 'VI0000002',
  year: 2020,
  ownership: null,
  size: null,
  weight: null,
  note: null,
  price: 1000,
  certificate: false,
  status: 'Available' as const,
  created_at: '2024-01-01T00:00:00Z',
};

describe('ItemForm', () => {
  const onSubmit = jest.fn().mockResolvedValue(createdInstrumentStub);
  const onClose = jest.fn();

  beforeEach(() => {
    (useDashboardForm as jest.Mock).mockReturnValue(baseFormState);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('auto-generates serial on mount for create mode', () => {
    render(
      <ItemForm
        isOpen
        onClose={onClose}
        onSubmit={onSubmit}
        submitting={false}
        selectedItem={null}
        isEditing={false}
        existingSerialNumbers={[]}
      />
    );

    expect(generateInstrumentSerialNumber).toHaveBeenCalled();
  });

  it('submits valid form data and shows success state', async () => {
    (useDashboardForm as jest.Mock).mockReturnValue({
      ...baseFormState,
      formData: {
        ...baseFormState.formData,
        maker: 'Strad',
        type: 'Violin',
        year: '2020',
        serial_number: 'VI0000002',
      },
      priceInput: '1000',
      costPriceInput: '',
      consignmentPriceInput: '',
    });

    render(
      <ItemForm
        isOpen
        onClose={onClose}
        onSubmit={onSubmit}
        submitting={false}
        selectedItem={null}
        isEditing={false}
        existingSerialNumbers={[]}
      />
    );

    fireEvent.click(screen.getByText('Add Item'));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          maker: 'Strad',
          type: 'Violin',
          serial_number: 'VI0000002',
          price: 1000,
        })
      )
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Item created successfully!/i)
      ).toBeInTheDocument();
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not show success UI when create returns no instrument (false success)', async () => {
    onSubmit.mockResolvedValueOnce(undefined);
    (useDashboardForm as jest.Mock).mockReturnValue({
      ...baseFormState,
      formData: {
        ...baseFormState.formData,
        maker: 'Strad',
        type: 'Violin',
        year: '2020',
        serial_number: 'VI0000002',
      },
      priceInput: '1000',
      costPriceInput: '',
      consignmentPriceInput: '',
    });

    render(
      <ItemForm
        isOpen
        onClose={onClose}
        onSubmit={onSubmit}
        submitting={false}
        selectedItem={null}
        isEditing={false}
        existingSerialNumbers={[]}
      />
    );

    fireEvent.click(screen.getByText('Add Item'));

    await waitFor(() => {
      expect(
        screen.queryByText(/Item created successfully!/i)
      ).not.toBeInTheDocument();
    });

    expect(await screen.findByText(/Create failed/i)).toBeInTheDocument();
  });

  it('shows error UI when create fails after serial conflict (API error)', async () => {
    onSubmit.mockRejectedValueOnce(
      new Error(
        'Could not allocate a unique serial number after several attempts.'
      )
    );
    (useDashboardForm as jest.Mock).mockReturnValue({
      ...baseFormState,
      formData: {
        ...baseFormState.formData,
        maker: 'Strad',
        type: 'Violin',
        year: '2020',
        serial_number: 'VI0000002',
      },
      priceInput: '1000',
      costPriceInput: '',
      consignmentPriceInput: '',
    });

    render(
      <ItemForm
        isOpen
        onClose={onClose}
        onSubmit={onSubmit}
        submitting={false}
        selectedItem={null}
        isEditing={false}
        existingSerialNumbers={[]}
      />
    );

    fireEvent.click(screen.getByText('Add Item'));

    expect(
      await screen.findByText(/unique serial number/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Item created successfully!/i)
    ).not.toBeInTheDocument();
  });

  it('does not offer Reserved when creating a new instrument', () => {
    render(
      <ItemForm
        isOpen
        onClose={onClose}
        onSubmit={onSubmit}
        submitting={false}
        selectedItem={null}
        isEditing={false}
        existingSerialNumbers={[]}
      />
    );

    expect(
      screen.queryByRole('option', { name: 'Reserved' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('Reserved status can be set after creation.')
    ).toBeInTheDocument();
  });

  it('does not show image upload controls in the add flow', () => {
    render(
      <ItemForm
        isOpen
        onClose={onClose}
        onSubmit={onSubmit}
        submitting={false}
        selectedItem={null}
        isEditing={false}
        existingSerialNumbers={[]}
      />
    );

    expect(screen.queryByLabelText(/^Images$/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(
        'Images are added after creation from the instrument detail view.'
      )
    ).toBeInTheDocument();
  });
});
