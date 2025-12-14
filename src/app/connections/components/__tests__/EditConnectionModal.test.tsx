import { render, screen, waitFor } from '@/test-utils/render';
import userEvent from '@testing-library/user-event';
import { EditConnectionModal } from '../EditConnectionModal';
import { ClientInstrument, Client, Instrument } from '@/types';

const mockClient: Client = {
  id: 'c1',
  first_name: 'John',
  last_name: 'Doe',
  email: 'john@example.com',
  contact_number: '010-1234-5678',
  tags: [],
  interest: null,
  note: null,
  client_number: 'CL001',
  created_at: '2024-01-01',
};

const mockInstrument: Instrument = {
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
};

const mockConnection: ClientInstrument = {
  id: 'conn1',
  client_id: 'c1',
  instrument_id: 'i1',
  relationship_type: 'Interested',
  notes: 'Test notes',
  created_at: '2024-01-01',
  client: mockClient,
  instrument: mockInstrument,
};

describe('EditConnectionModal', () => {
  const mockOnClose = jest.fn();
  const mockOnSave = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should not render when isOpen is false', () => {
    render(
      <EditConnectionModal
        isOpen={false}
        onClose={mockOnClose}
        onSave={mockOnSave}
        connection={mockConnection}
        clients={[mockClient]}
        items={[mockInstrument]}
      />
    );

    expect(screen.queryByText('Edit Connection')).not.toBeInTheDocument();
  });

  it('should not render when connection is null', () => {
    render(
      <EditConnectionModal
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        connection={null}
        clients={[mockClient]}
        items={[mockInstrument]}
      />
    );

    expect(screen.queryByText('Edit Connection')).not.toBeInTheDocument();
  });

  it('should render when isOpen is true and connection exists', () => {
    render(
      <EditConnectionModal
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        connection={mockConnection}
        clients={[mockClient]}
        items={[mockInstrument]}
      />
    );

    expect(screen.getByText('Edit Connection')).toBeInTheDocument();
  });

  it('should display connection information', () => {
    render(
      <EditConnectionModal
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        connection={mockConnection}
        clients={[mockClient]}
        items={[mockInstrument]}
      />
    );

    expect(screen.getByText(/Stradivari.*Violin/i)).toBeInTheDocument();
    expect(screen.getByText(/John.*Doe/i)).toBeInTheDocument();
  });

  it('should initialize form with connection data', () => {
    render(
      <EditConnectionModal
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        connection={mockConnection}
        clients={[mockClient]}
        items={[mockInstrument]}
      />
    );

    const relationshipSelect = screen.getByRole('combobox');
    expect(relationshipSelect).toHaveValue('Interested');

    const notesTextarea = screen.getByPlaceholderText(
      /Add any additional notes/i
    );
    expect(notesTextarea).toHaveValue('Test notes');
  });

  it('should update relationship type when select changes', async () => {
    const user = userEvent.setup();
    render(
      <EditConnectionModal
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        connection={mockConnection}
        clients={[mockClient]}
        items={[mockInstrument]}
      />
    );

    const relationshipSelect = screen.getByRole('combobox');
    await user.selectOptions(relationshipSelect, 'Owned');

    expect(relationshipSelect).toHaveValue('Owned');
  });

  it('should update notes when textarea changes', async () => {
    const user = userEvent.setup();
    render(
      <EditConnectionModal
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        connection={mockConnection}
        clients={[mockClient]}
        items={[mockInstrument]}
      />
    );

    const notesTextarea = screen.getByPlaceholderText(
      /Add any additional notes/i
    );
    await user.clear(notesTextarea);
    await user.type(notesTextarea, 'Updated notes');

    expect(notesTextarea).toHaveValue('Updated notes');
  });

  it('should call onSave with correct data when form is submitted', async () => {
    const user = userEvent.setup();
    render(
      <EditConnectionModal
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        connection={mockConnection}
        clients={[mockClient]}
        items={[mockInstrument]}
      />
    );

    const relationshipSelect = screen.getByRole('combobox');
    await user.selectOptions(relationshipSelect, 'Sold');

    const notesTextarea = screen.getByPlaceholderText(
      /Add any additional notes/i
    );
    await user.clear(notesTextarea);
    await user.type(notesTextarea, 'Sold to client');

    const saveButton = screen.getByRole('button', { name: /Save Changes/i });
    await user.click(saveButton);

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledWith('conn1', {
        relationshipType: 'Sold',
        notes: 'Sold to client',
      });
    });
  });

  it('should call onClose after successful save', async () => {
    const user = userEvent.setup();
    render(
      <EditConnectionModal
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        connection={mockConnection}
        clients={[mockClient]}
        items={[mockInstrument]}
      />
    );

    const saveButton = screen.getByRole('button', { name: /Save Changes/i });
    await user.click(saveButton);

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalled();
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('should not call onClose when save fails', async () => {
    const user = userEvent.setup();
    const failingOnSave = jest.fn().mockRejectedValue(new Error('Save failed'));

    render(
      <EditConnectionModal
        isOpen={true}
        onClose={mockOnClose}
        onSave={failingOnSave}
        connection={mockConnection}
        clients={[mockClient]}
        items={[mockInstrument]}
      />
    );

    const saveButton = screen.getByRole('button', { name: /Save Changes/i });
    await user.click(saveButton);

    await waitFor(() => {
      expect(failingOnSave).toHaveBeenCalled();
    });

    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it('should show loading state while submitting', async () => {
    const user = userEvent.setup();
    const slowOnSave = jest.fn(
      () => new Promise<void>(resolve => setTimeout(resolve, 100))
    );

    render(
      <EditConnectionModal
        isOpen={true}
        onClose={mockOnClose}
        onSave={slowOnSave}
        connection={mockConnection}
        clients={[mockClient]}
        items={[mockInstrument]}
      />
    );

    const saveButton = screen.getByRole('button', { name: /Save Changes/i });
    await user.click(saveButton);

    expect(screen.getByText('Saving...')).toBeInTheDocument();
    expect(saveButton).toBeDisabled();

    await waitFor(() => {
      expect(screen.queryByText('Saving...')).not.toBeInTheDocument();
    });
  });

  it('should call onClose when close button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <EditConnectionModal
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        connection={mockConnection}
        clients={[mockClient]}
        items={[mockInstrument]}
      />
    );

    const closeButton = screen
      .getAllByRole('button')
      .find(button => button.querySelector('svg'));
    if (closeButton) {
      await user.click(closeButton);
    }

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should call onClose when backdrop is clicked', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <EditConnectionModal
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        connection={mockConnection}
        clients={[mockClient]}
        items={[mockInstrument]}
      />
    );

    const backdrop = container.querySelector('.fixed.inset-0');
    if (backdrop) {
      await user.click(backdrop);
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    }
  });

  it('should not call onClose when modal content is clicked', async () => {
    const user = userEvent.setup();
    render(
      <EditConnectionModal
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        connection={mockConnection}
        clients={[mockClient]}
        items={[mockInstrument]}
      />
    );

    const modalContent = screen.getByText('Edit Connection');
    await user.click(modalContent);

    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it('should call onClose when cancel button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <EditConnectionModal
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        connection={mockConnection}
        clients={[mockClient]}
        items={[mockInstrument]}
      />
    );

    const cancelButton = screen.getByRole('button', { name: /Cancel/i });
    await user.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should update form when connection prop changes', () => {
    const { rerender } = render(
      <EditConnectionModal
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        connection={mockConnection}
        clients={[mockClient]}
        items={[mockInstrument]}
      />
    );

    const newConnection: ClientInstrument = {
      ...mockConnection,
      id: 'conn2',
      relationship_type: 'Owned',
      notes: 'New notes',
    };

    rerender(
      <EditConnectionModal
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        connection={newConnection}
        clients={[mockClient]}
        items={[mockInstrument]}
      />
    );

    const relationshipSelect = screen.getByRole('combobox');
    expect(relationshipSelect).toHaveValue('Owned');

    const notesTextarea = screen.getByPlaceholderText(
      /Add any additional notes/i
    );
    expect(notesTextarea).toHaveValue('New notes');
  });

  it('should handle connection with null notes', () => {
    const connectionWithoutNotes: ClientInstrument = {
      ...mockConnection,
      notes: null,
    };

    render(
      <EditConnectionModal
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        connection={connectionWithoutNotes}
        clients={[mockClient]}
        items={[mockInstrument]}
      />
    );

    const notesTextarea = screen.getByPlaceholderText(
      /Add any additional notes/i
    );
    expect(notesTextarea).toHaveValue('');
  });
});
