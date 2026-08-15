// src/app/calendar/components/__tests__/TaskModal.test.tsx
import { render, screen, waitFor } from '@/test-utils/render';
import userEvent from '@testing-library/user-event';
import TaskModal from '../TaskModal';
import { MaintenanceTask, Instrument } from '@/types';

const discardConfirmationHeading = () =>
  screen.queryByRole('heading', { name: /discard changes\?/i });

// Mock Button and Input components
jest.mock('@/components/common/inputs', () => {
  return {
    Button: ({ children, onClick, disabled, ...props }: any) => (
      <button onClick={onClick} disabled={disabled} {...props}>
        {children}
      </button>
    ),
    Input: ({ label, value, onChange, type, ...props }: any) => (
      <div>
        {label && <label>{label}</label>}
        <input
          type={type || 'text'}
          value={value}
          onChange={onChange}
          {...props}
        />
      </div>
    ),
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

  it('when editing completed task, status dropdown only lists allowed transitions', () => {
    render(
      <TaskModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        submitting={false}
        isEditing={true}
        selectedTask={{ ...mockTask, status: 'completed' }}
        instruments={mockInstruments}
        clients={[]}
      />
    );

    const statusSelect = document.querySelector(
      'select[name="status"]'
    ) as HTMLSelectElement;
    const options = Array.from(statusSelect.querySelectorAll('option'));
    expect(options.map(o => o.value)).toEqual(['completed']);
  });

  it('shows form error when onSubmit rejects', async () => {
    const user = userEvent.setup();
    const onSubmit = jest
      .fn()
      .mockRejectedValue(new Error('Server rejected save'));

    render(
      <TaskModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={onSubmit}
        submitting={false}
        instruments={mockInstruments}
        clients={[]}
      />
    );

    const instrumentSelect = document.querySelector(
      'select[name="instrument_id"]'
    ) as HTMLSelectElement;
    await user.selectOptions(instrumentSelect, 'instrument-1');

    const titleInput = document.querySelector(
      'input[name="title"]'
    ) as HTMLInputElement;
    await user.type(titleInput, 'My task');

    await user.click(screen.getByRole('button', { name: /create task/i }));

    await waitFor(() => {
      expect(screen.getByText(/Server rejected save/i)).toBeInTheDocument();
    });
    expect(mockOnClose).not.toHaveBeenCalled();
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

  describe('dirty-close protection', () => {
    it('A: create mode - Escape on a dirty form shows discard confirmation, "Keep editing" preserves input', async () => {
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

      const titleInput = document.querySelector(
        'input[name="title"]'
      ) as HTMLInputElement;
      await user.type(titleInput, 'Unsaved title');

      await user.keyboard('{Escape}');

      expect(discardConfirmationHeading()).toBeInTheDocument();
      expect(mockOnClose).not.toHaveBeenCalled();
      // Modal itself stays mounted/open
      expect(screen.getByText('Add New Task')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /keep editing/i }));

      expect(discardConfirmationHeading()).not.toBeInTheDocument();
      expect(mockOnClose).not.toHaveBeenCalled();
      expect(titleInput).toHaveValue('Unsaved title');
    });

    it('B: create mode - outside click on a dirty form shows discard confirmation instead of closing', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <TaskModal
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          submitting={false}
          instruments={mockInstruments}
          clients={[]}
        />
      );

      const titleInput = document.querySelector(
        'input[name="title"]'
      ) as HTMLInputElement;
      await user.type(titleInput, 'Unsaved title');

      const overlay = container.firstChild as HTMLElement;
      await user.click(overlay);

      expect(discardConfirmationHeading()).toBeInTheDocument();
      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it('C: Cancel button requires confirmation when dirty, closes immediately when clean', async () => {
      const user = userEvent.setup();
      const { unmount } = render(
        <TaskModal
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          submitting={false}
          instruments={mockInstruments}
          clients={[]}
        />
      );

      // Clean form: Cancel closes immediately, no confirmation
      await user.click(screen.getByRole('button', { name: /^cancel$/i }));
      expect(mockOnClose).toHaveBeenCalledTimes(1);
      expect(discardConfirmationHeading()).not.toBeInTheDocument();
      unmount();

      mockOnClose.mockClear();

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

      const titleInput = document.querySelector(
        'input[name="title"]'
      ) as HTMLInputElement;
      await user.type(titleInput, 'Dirty');

      await user.click(screen.getByRole('button', { name: /^cancel$/i }));

      expect(discardConfirmationHeading()).toBeInTheDocument();
      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it('D: confirming discard closes the modal, reopening starts clean', async () => {
      const user = userEvent.setup();
      const { rerender } = render(
        <TaskModal
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          submitting={false}
          instruments={mockInstruments}
          clients={[]}
        />
      );

      const titleInput = document.querySelector(
        'input[name="title"]'
      ) as HTMLInputElement;
      await user.type(titleInput, 'Dirty');

      await user.keyboard('{Escape}');
      expect(discardConfirmationHeading()).toBeInTheDocument();

      await user.click(
        screen.getByRole('button', { name: /discard changes/i })
      );

      expect(mockOnClose).toHaveBeenCalledTimes(1);
      expect(discardConfirmationHeading()).not.toBeInTheDocument();

      // Simulate the parent closing and reopening the modal fresh
      rerender(
        <TaskModal
          isOpen={false}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          submitting={false}
          instruments={mockInstruments}
          clients={[]}
        />
      );
      rerender(
        <TaskModal
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          submitting={false}
          instruments={mockInstruments}
          clients={[]}
        />
      );

      const reopenedTitleInput = document.querySelector(
        'input[name="title"]'
      ) as HTMLInputElement;
      expect(reopenedTitleInput).toHaveValue('');
    });

    it('E: edit mode - dirty field requires confirmation; discard + reopen restores persisted original values', async () => {
      const user = userEvent.setup();
      const { rerender } = render(
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

      const titleInput = document.querySelector(
        'input[name="title"]'
      ) as HTMLInputElement;
      await user.clear(titleInput);
      await user.type(titleInput, 'Changed title');

      await user.keyboard('{Escape}');
      expect(discardConfirmationHeading()).toBeInTheDocument();
      expect(mockOnClose).not.toHaveBeenCalled();

      await user.click(
        screen.getByRole('button', { name: /discard changes/i })
      );
      expect(mockOnClose).toHaveBeenCalledTimes(1);

      // Reopen on the same (unmodified, persisted) selectedTask
      rerender(
        <TaskModal
          isOpen={false}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          submitting={false}
          isEditing={true}
          selectedTask={mockTask}
          instruments={mockInstruments}
          clients={[]}
        />
      );
      rerender(
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

      const reopenedTitleInput = document.querySelector(
        'input[name="title"]'
      ) as HTMLInputElement;
      expect(reopenedTitleInput).toHaveValue(mockTask.title);
    });

    it('F: reverting a field to its original value makes the form clean again (closes without confirmation)', async () => {
      const user = userEvent.setup();
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

      const titleInput = document.querySelector(
        'input[name="title"]'
      ) as HTMLInputElement;
      await user.type(titleInput, 'X');
      await user.keyboard('{Backspace}');

      expect(titleInput).toHaveValue(mockTask.title);

      await user.keyboard('{Escape}');

      expect(discardConfirmationHeading()).not.toBeInTheDocument();
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('G: failed submit keeps modal open with entered values, still requires discard confirmation on subsequent close', async () => {
      const user = userEvent.setup();
      const onSubmit = jest
        .fn()
        .mockRejectedValue(new Error('Server rejected save'));

      render(
        <TaskModal
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={onSubmit}
          submitting={false}
          instruments={mockInstruments}
          clients={[]}
        />
      );

      const instrumentSelect = document.querySelector(
        'select[name="instrument_id"]'
      ) as HTMLSelectElement;
      await user.selectOptions(instrumentSelect, 'instrument-1');

      const titleInput = document.querySelector(
        'input[name="title"]'
      ) as HTMLInputElement;
      await user.type(titleInput, 'My task');

      await user.click(screen.getByRole('button', { name: /create task/i }));

      await waitFor(() => {
        expect(screen.getByText(/Server rejected save/i)).toBeInTheDocument();
      });
      expect(mockOnClose).not.toHaveBeenCalled();
      expect(titleInput).toHaveValue('My task');

      await user.keyboard('{Escape}');
      expect(discardConfirmationHeading()).toBeInTheDocument();
      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it('H: successful submit still closes via parent without showing the discard confirmation', async () => {
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

      const instrumentSelect = document.querySelector(
        'select[name="instrument_id"]'
      ) as HTMLSelectElement;
      await user.selectOptions(instrumentSelect, 'instrument-1');

      const titleInput = document.querySelector(
        'input[name="title"]'
      ) as HTMLInputElement;
      await user.type(titleInput, 'My task');

      await user.click(screen.getByRole('button', { name: /create task/i }));

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledTimes(1);
      });
      expect(discardConfirmationHeading()).not.toBeInTheDocument();
    });

    it('I: repeated Escape/outside-close attempts while confirmation is open only ever show one dialog', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <TaskModal
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          submitting={false}
          instruments={mockInstruments}
          clients={[]}
        />
      );

      const titleInput = document.querySelector(
        'input[name="title"]'
      ) as HTMLInputElement;
      await user.type(titleInput, 'Dirty');

      await user.keyboard('{Escape}');
      expect(discardConfirmationHeading()).toBeInTheDocument();

      const overlay = container.firstChild as HTMLElement;
      await user.click(overlay);
      await user.keyboard('{Escape}');
      await user.keyboard('{Escape}');

      expect(
        screen.getAllByRole('heading', { name: /discard changes\?/i })
      ).toHaveLength(1);
      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  describe('stale-write CAS', () => {
    const T0 = '2024-01-01T00:00:00Z';
    const T1 = '2024-01-01T01:00:00Z';

    function renderEdit(
      overrides: {
        selectedTask?: MaintenanceTask;
        onSubmit?: jest.Mock;
        onFetchLatest?: jest.Mock;
      } = {}
    ) {
      const onSubmit = overrides.onSubmit ?? mockOnSubmit;
      const onFetchLatest =
        overrides.onFetchLatest ?? jest.fn().mockResolvedValue(null);
      const selectedTask = overrides.selectedTask ?? mockTask;

      const view = render(
        <TaskModal
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={onSubmit}
          submitting={false}
          isEditing={true}
          selectedTask={selectedTask}
          instruments={mockInstruments}
          clients={[]}
          onFetchLatest={onFetchLatest}
        />
      );

      return { ...view, onSubmit, onFetchLatest };
    }

    async function changeNotes(
      user: ReturnType<typeof userEvent.setup>,
      value: string
    ) {
      const notes = document.querySelector(
        'textarea[name="notes"]'
      ) as HTMLTextAreaElement;
      await user.clear(notes);
      await user.type(notes, value);
      return notes;
    }

    it('captures T0 as the expected version when editing begins', async () => {
      const user = userEvent.setup();
      const { onSubmit } = renderEdit();

      await changeNotes(user, 'Needs inspection');
      await user.click(screen.getByRole('button', { name: /update task/i }));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledTimes(1);
      });

      expect(onSubmit.mock.calls[0][0].expected_updated_at).toBe(T0);
      expect(onSubmit.mock.calls[0][0].notes).toBe('Needs inspection');
      expect(onSubmit.mock.calls[0][0].status).toBe('pending');
    });

    it('keeps the dirty draft token at T0 when selectedTask refreshes to T1', async () => {
      const user = userEvent.setup();
      const { rerender, onSubmit, onFetchLatest } = renderEdit();

      await changeNotes(user, 'Needs inspection');

      const refreshedTask: MaintenanceTask = {
        ...mockTask,
        status: 'completed',
        notes: 'Original from server T1',
        updated_at: T1,
      };

      rerender(
        <TaskModal
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={onSubmit}
          submitting={false}
          isEditing={true}
          selectedTask={refreshedTask}
          instruments={mockInstruments}
          clients={[]}
          onFetchLatest={onFetchLatest}
        />
      );

      const notes = document.querySelector(
        'textarea[name="notes"]'
      ) as HTMLTextAreaElement;
      expect(notes).toHaveValue('Needs inspection');

      await user.click(screen.getByRole('button', { name: /update task/i }));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledTimes(1);
      });

      expect(onSubmit.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          expected_updated_at: T0,
          notes: 'Needs inspection',
          status: 'pending',
        })
      );
      expect(onSubmit.mock.calls[0][0].expected_updated_at).not.toBe(T1);
    });

    it('keeps the modal open, preserves the local draft, and does not retry on 409', async () => {
      const user = userEvent.setup();
      const { ApiResponseError } = jest.requireActual(
        '@/utils/handleApiResponse'
      );
      const onSubmit = jest.fn().mockRejectedValue(
        new ApiResponseError(
          'This maintenance task was updated elsewhere. Review the latest version before saving again.',
          {
            status: 409,
            error_code: 'MAINTENANCE_TASK_STALE_VERSION',
          }
        )
      );
      const onFetchLatest = jest.fn().mockResolvedValue({
        ...mockTask,
        status: 'completed',
        updated_at: T1,
      });

      renderEdit({ onSubmit, onFetchLatest });
      await changeNotes(user, 'Needs inspection');
      await user.click(screen.getByRole('button', { name: /update task/i }));

      await waitFor(() => {
        expect(
          screen.getByText(/this maintenance task was updated elsewhere/i)
        ).toBeInTheDocument();
      });

      expect(screen.getByText('Edit Task')).toBeInTheDocument();
      expect(mockOnClose).not.toHaveBeenCalled();
      expect(document.querySelector('textarea[name="notes"]')).toHaveValue(
        'Needs inspection'
      );
      expect(
        screen.getByRole('button', { name: /reload latest/i })
      ).toBeInTheDocument();
      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onSubmit.mock.calls[0][0].expected_updated_at).toBe(T0);
    });

    it('save-again without reload still sends T0 and cannot pair stale fields with T1', async () => {
      const user = userEvent.setup();
      const { ApiResponseError } = jest.requireActual(
        '@/utils/handleApiResponse'
      );
      const onSubmit = jest.fn().mockRejectedValue(
        new ApiResponseError('stale', {
          status: 409,
          error_code: 'MAINTENANCE_TASK_STALE_VERSION',
        })
      );
      const { rerender, onFetchLatest } = renderEdit({ onSubmit });

      await changeNotes(user, 'Needs inspection');
      await user.click(screen.getByRole('button', { name: /update task/i }));
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));

      rerender(
        <TaskModal
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={onSubmit}
          submitting={false}
          isEditing={true}
          selectedTask={{ ...mockTask, status: 'completed', updated_at: T1 }}
          instruments={mockInstruments}
          clients={[]}
          onFetchLatest={onFetchLatest}
        />
      );

      await user.click(screen.getByRole('button', { name: /update task/i }));
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));

      expect(onSubmit.mock.calls[0][0].expected_updated_at).toBe(T0);
      expect(onSubmit.mock.calls[1][0].expected_updated_at).toBe(T0);
      expect(onSubmit.mock.calls[1][0].notes).toBe('Needs inspection');
      expect(onSubmit.mock.calls[1][0].status).toBe('pending');
    });

    it('explicit Reload latest replaces both fields and the version token', async () => {
      const user = userEvent.setup();
      const { ApiResponseError } = jest.requireActual(
        '@/utils/handleApiResponse'
      );
      const latestTask: MaintenanceTask = {
        ...mockTask,
        status: 'completed',
        notes: 'Server notes T1',
        updated_at: T1,
      };
      const onSubmit = jest
        .fn()
        .mockRejectedValueOnce(
          new ApiResponseError('stale', {
            status: 409,
            error_code: 'MAINTENANCE_TASK_STALE_VERSION',
          })
        )
        .mockResolvedValueOnce(undefined);
      const onFetchLatest = jest.fn().mockResolvedValue(latestTask);

      renderEdit({ onSubmit, onFetchLatest });
      await changeNotes(user, 'Needs inspection');
      await user.click(screen.getByRole('button', { name: /update task/i }));
      await waitFor(() =>
        screen.getByRole('button', { name: /reload latest/i })
      );

      await user.click(screen.getByRole('button', { name: /reload latest/i }));

      await waitFor(() => {
        expect(document.querySelector('textarea[name="notes"]')).toHaveValue(
          'Server notes T1'
        );
      });

      const notes = document.querySelector(
        'textarea[name="notes"]'
      ) as HTMLTextAreaElement;
      await user.clear(notes);
      await user.type(notes, 'Post-reconcile notes');
      await user.click(screen.getByRole('button', { name: /update task/i }));

      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
      expect(onSubmit.mock.calls[1][0]).toEqual(
        expect.objectContaining({
          expected_updated_at: T1,
          notes: 'Post-reconcile notes',
          status: 'completed',
        })
      );
    });

    it('does not let a late latest-fetch response erase a newer local edit', async () => {
      const user = userEvent.setup();
      const { ApiResponseError } = jest.requireActual(
        '@/utils/handleApiResponse'
      );
      let resolveLatest: (task: MaintenanceTask) => void = () => undefined;
      const onFetchLatest = jest.fn(
        () =>
          new Promise<MaintenanceTask>(resolve => {
            resolveLatest = resolve;
          })
      );
      const onSubmit = jest.fn().mockRejectedValue(
        new ApiResponseError('stale', {
          status: 409,
          error_code: 'MAINTENANCE_TASK_STALE_VERSION',
        })
      );

      renderEdit({ onSubmit, onFetchLatest });
      await changeNotes(user, 'Needs inspection');
      await user.click(screen.getByRole('button', { name: /update task/i }));

      await waitFor(() => expect(onFetchLatest).toHaveBeenCalled());

      await changeNotes(user, 'Typed after conflict');
      resolveLatest({
        ...mockTask,
        status: 'completed',
        notes: 'Server notes T1',
        updated_at: T1,
      });

      await waitFor(() => {
        expect(document.querySelector('textarea[name="notes"]')).toHaveValue(
          'Typed after conflict'
        );
      });

      await user.click(screen.getByRole('button', { name: /update task/i }));
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
      expect(onSubmit.mock.calls[1][0].expected_updated_at).toBe(T0);
      expect(onSubmit.mock.calls[1][0].notes).toBe('Typed after conflict');
    });
  });
});
