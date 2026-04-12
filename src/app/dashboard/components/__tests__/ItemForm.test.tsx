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

describe('ItemForm', () => {
  const onSubmit = jest.fn().mockResolvedValue(undefined);
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
});
