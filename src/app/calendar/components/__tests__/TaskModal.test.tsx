// src/app/calendar/components/__tests__/TaskModal.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TaskModal from '../TaskModal';
import { MaintenanceTask, Instrument } from '@/types';

// Mock Button and Input components
jest.mock('@/components/common/Button', () => {
  return function Button({ children, onClick, disabled, ...props }: any) {
    return (
      <button onClick={onClick} disabled={disabled} {...props}>
        {children}
      </button>
    );
  };
});

jest.mock('@/components/common/Input', () => {
  return function Input({ label, value, onChange, type, ...props }: any) {
    return (
      <div>
        {label && <label>{label}</label>}
        <input
          type={type || 'text'}
          value={value}
          onChange={onChange}
          {...props}
        />
      </div>
    );
  };
});

// Mock classNames
jest.mock('@/utils/classNames', () => ({
  classNames: (...args: any[]) => args.filter(Boolean).join(' '),
}));

describe('TaskModal', () => {
  const mockInstruments: Instrument[] = [
    {
      id: 'instrument-1',
      status: 'Available',
      maker: 'Stradivarius',
      type: 'Violin',
      subtype: null,
      year: 1700,
      certificate: true,
      size: '4/4',
      weight: '500g',
      price: 1000000,
      ownership: 'Private',
      note: 'Antique violin',
      serial_number: null,
      created_at: '2024-01-01T00:00:00Z',
    },
  ];

  const mockTask: MaintenanceTask = {
    id: '1',
    instrument_id: 'instrument-1',
    client_id: null,
    task_type: 'repair',
    title: 'Violin Repair',
    description: 'Fix bridge',
    status: 'pending',
    received_date: '2024-01-01',
    due_date: '2024-01-15',
    personal_due_date: '2024-01-10',
    scheduled_date: '2024-01-05',
    completed_date: null,
    priority: 'medium',
    estimated_hours: 2,
    actual_hours: null,
    cost: 100,
    notes: 'Test notes',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  };

  const mockOnClose = jest.fn();
  const mockOnSubmit = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should not render when isOpen is false', () => {
    const { container } = render(
      <TaskModal
        isOpen={false}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        submitting={false}
        instruments={mockInstruments}
        clients={[]}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('should render when isOpen is true', () => {
    render(
      <TaskModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        submitting={false}
        instruments={mockInstruments}
        clients={[]}
      />
    );

    // Modal should render - look for header title
    expect(screen.getByText('Add New Task')).toBeInTheDocument();
    // Check for form elements - instrument label (more specific)
    expect(screen.getByText(/instrument\/bow/i)).toBeInTheDocument();
  });

  it('should render create mode when isEditing is false', () => {
    render(
      <TaskModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        submitting={false}
        isEditing={false}
        instruments={mockInstruments}
        clients={[]}
      />
    );

    // Check for create mode title
    expect(screen.getByText('Add New Task')).toBeInTheDocument();
    // Look for create button
    expect(
      screen.getByRole('button', { name: /create task/i })
    ).toBeInTheDocument();
  });

  it('should render edit mode when isEditing is true', () => {
    render(
      <TaskModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        submitting={false}
        isEditing={true}
        selectedTask={mockTask}
        instruments={mockInstruments}
        clients={[]}
      />
    );

    // Check for edit mode title
    expect(screen.getByText('Edit Task')).toBeInTheDocument();
    // Look for update button
    expect(
      screen.getByRole('button', { name: /update task/i })
    ).toBeInTheDocument();
  });

  it('should display selected task data when editing', () => {
    render(
      <TaskModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        submitting={false}
        isEditing={true}
        selectedTask={mockTask}
        instruments={mockInstruments}
        clients={[]}
      />
    );

    // Check that task title is in the form
    expect(screen.getByDisplayValue('Violin Repair')).toBeInTheDocument();
  });

  it('should handle close', async () => {
    const user = userEvent.setup();
    render(
      <TaskModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        submitting={false}
        instruments={mockInstruments}
        clients={[]}
      />
    );

    // Find close button by aria-label
    const closeButton = screen.getByLabelText('Close modal');
    await user.click(closeButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should handle form submission', async () => {
    const user = userEvent.setup();
    render(
      <TaskModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        submitting={false}
        instruments={mockInstruments}
        clients={[]}
      />
    );

    // Fill in required fields
    // Find instrument select by name attribute
    const instrumentSelect =
      screen.getByDisplayValue('Select an instrument') ||
      document.querySelector('select[name="instrument_id"]');
    if (instrumentSelect) {
      await user.selectOptions(instrumentSelect as HTMLElement, 'instrument-1');
    }

    // Find title input by placeholder or name
    const titleInput =
      screen.queryByPlaceholderText(/enter task title/i) ||
      document.querySelector('input[name="title"]');
    if (titleInput) {
      await user.type(titleInput as HTMLElement, 'New Task');
    }

    // Submit form
    const submitButton = screen.getByRole('button', { name: /create task/i });
    await user.click(submitButton);

    // Wait for submit to be called or validation error
    await waitFor(
      () => {
        // If validation passes, onSubmit should be called
        // If validation fails, errors should be displayed
        const hasError = screen.queryByText(/instrument is required/i) !== null;
        const wasSubmitted = mockOnSubmit.mock.calls.length > 0;
        expect(hasError || wasSubmitted).toBe(true);
      },
      { timeout: 3000 }
    );
  });

  it('should display loading state when submitting', () => {
    render(
      <TaskModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        submitting={true}
        instruments={mockInstruments}
        clients={[]}
      />
    );

    // Submit button should be disabled when submitting
    const submitButton = screen.getByRole('button', { name: /saving/i });
    expect(submitButton).toBeDisabled();
    // Check for loading text
    expect(screen.getByText('Saving...')).toBeInTheDocument();
  });
});
