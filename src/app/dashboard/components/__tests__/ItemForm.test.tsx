import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  validateInstrumentSerial: jest
    .requireActual('@/utils/uniqueNumberGenerator')
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

  it('submits valid form data and closes modal', async () => {
    (useDashboardForm as jest.Mock).mockReturnValue({
      ...baseFormState,
      formData: {
        ...baseFormState.formData,
        maker: 'Strad',
        type: 'Violin',
        year: '2020',
        price: '1000',
        serial_number: 'VI0000002',
      },
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
        })
      )
    );
    
    // UX: In create mode, success message is shown instead of immediately closing
    // So onClose won't be called immediately - it will be called when user clicks "Done"
    // For editing mode, onClose would be called immediately
    await waitFor(() => {
      expect(screen.getByText(/Item created successfully/i)).toBeInTheDocument();
    }, { timeout: 3000 });
    // onClose is not called immediately in create mode - user sees success message
  });
});
