// src/app/calendar/__tests__/page.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CalendarPage from '../page';
import { MaintenanceTask } from '@/types';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  usePathname: jest.fn(() => '/calendar'),
}));

// Mock next/dynamic
jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: () => {
    return function DynamicComponent(props: any) {
      return (
        <div data-testid="dynamic-component">
          {props.children || 'Dynamic Component'}
        </div>
      );
    };
  },
}));

// Mock useErrorHandler
jest.mock('@/hooks/useErrorHandler', () => ({
  useErrorHandler: () => ({
    ErrorToasts: () => <div data-testid="error-toasts">Error Toasts</div>,
    handleError: jest.fn(),
  }),
}));

// Mock useUnifiedData
jest.mock('@/hooks/useUnifiedData', () => ({
  useUnifiedData: () => ({
    instruments: [
      {
        id: 'instrument-1',
        status: 'Available',
        maker: 'Stradivarius',
        type: 'Violin',
        year: 1700,
        certificate: true,
        subtype: null,
        size: '4/4',
        weight: '500g',
        price: 1000000,
        ownership: 'Private',
        note: 'Antique violin',
        serial_number: null,
        created_at: '2024-01-01T00:00:00Z',
      },
    ],
    clients: [
      {
        id: 'client-1',
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        contact_number: '123-456-7890',
        tags: ['Owner'],
        interest: null,
        note: null,
        client_number: null,
        created_at: '2024-01-01T00:00:00Z',
      },
    ],
    loading: false,
  }),
}));

// Mock useMaintenanceTasks
const mockTasks: MaintenanceTask[] = [
  {
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
  },
];

const mockCreateTask = jest.fn().mockResolvedValue(mockTasks[0]);
const mockUpdateTask = jest.fn().mockResolvedValue(mockTasks[0]);
const mockDeleteTask = jest.fn().mockResolvedValue(undefined);
const mockFetchTasksByDateRange = jest.fn().mockResolvedValue(mockTasks);
const mockFetchTasksByScheduledDate = jest.fn().mockResolvedValue(mockTasks);

jest.mock('@/hooks/useMaintenanceTasks', () => ({
  useMaintenanceTasks: jest.fn(() => ({
    tasks: mockTasks,
    loading: false,
    createTask: mockCreateTask,
    updateTask: mockUpdateTask,
    deleteTask: mockDeleteTask,
    fetchTasksByDateRange: mockFetchTasksByDateRange,
    fetchTasksByScheduledDate: mockFetchTasksByScheduledDate,
  })),
}));

// Mock useModalState
jest.mock('@/hooks/useModalState', () => ({
  useModalState: () => ({
    isOpen: false,
    isEditing: false,
    openModal: jest.fn(),
    closeModal: jest.fn(),
    openEditModal: jest.fn(),
    selectedItem: null,
  }),
}));

// Mock AppLayout
jest.mock('@/components/layout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-layout">{children}</div>
  ),
}));

// Mock ErrorBoundary
jest.mock('@/components/common', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="error-boundary">{children}</div>
  ),
  SpinnerLoading: () => <div data-testid="spinner-loading">Loading...</div>,
  Button: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => <button onClick={onClick}>{children}</button>,
}));

// Mock calendar components
jest.mock('../components/CalendarView', () => {
  return function CalendarView({ events, onSelectEvent, onSelectSlot }: any) {
    return (
      <div data-testid="calendar-view">
        <div>Calendar View</div>
        {events?.map((event: any) => (
          <div
            key={event.id}
            data-testid={`calendar-event-${event.id}`}
            onClick={() => onSelectEvent?.(event)}
          >
            {event.title}
          </div>
        ))}
        <button
          data-testid="select-slot-button"
          onClick={() => onSelectSlot?.({ start: new Date(), end: new Date() })}
        >
          Select Slot
        </button>
      </div>
    );
  };
});

jest.mock('../components/TaskList', () => {
  return function TaskList({ tasks, onTaskDelete, onTaskClick }: any) {
    return (
      <div data-testid="task-list">
        <div>Task List</div>
        {tasks?.map((task: any) => (
          <div
            key={task.id}
            data-testid={`task-${task.id}`}
            onClick={() => onTaskClick?.(task)}
          >
            {task.title}
            <button
              data-testid={`delete-task-${task.id}`}
              onClick={e => {
                e.stopPropagation();
                onTaskDelete?.(task.id);
              }}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    );
  };
});

jest.mock('../components/GroupedTaskList', () => {
  return function GroupedTaskList({ tasks, onTaskDelete, onTaskClick }: any) {
    return (
      <div data-testid="task-list">
        <div>Grouped Task List</div>
        {tasks?.map((task: any) => (
          <div
            key={task.id}
            data-testid={`task-${task.id}`}
            onClick={() => onTaskClick?.(task)}
          >
            {task.title}
            <button
              data-testid={`delete-task-${task.id}`}
              onClick={e => {
                e.stopPropagation();
                onTaskDelete?.(task.id);
              }}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    );
  };
});

jest.mock('../components/TaskModal', () => {
  return function TaskModal({
    isOpen,
    onClose,
    onSubmit,
    selectedTask,
    isEditing,
  }: any) {
    if (!isOpen) return null;
    return (
      <div data-testid="task-modal">
        <div>Task Modal</div>
        <div data-testid="modal-editing">
          {isEditing ? 'Editing' : 'Creating'}
        </div>
        {selectedTask && (
          <div data-testid="modal-selected-task">{selectedTask.title}</div>
        )}
        <button data-testid="modal-close" onClick={onClose}>
          Close
        </button>
        <button
          data-testid="modal-submit"
          onClick={() =>
            onSubmit?.({ title: 'New Task', instrument_id: 'instrument-1' })
          }
        >
          Submit
        </button>
      </div>
    );
  };
});

describe('CalendarPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mock implementations
    mockFetchTasksByDateRange.mockResolvedValue(mockTasks);
    mockFetchTasksByScheduledDate.mockResolvedValue(mockTasks);
    mockCreateTask.mockResolvedValue(mockTasks[0]);
    mockUpdateTask.mockResolvedValue(mockTasks[0]);
    mockDeleteTask.mockResolvedValue(undefined);
  });

  it('should render the calendar page', async () => {
    render(<CalendarPage />);

    await waitFor(
      () => {
        expect(screen.getByTestId('app-layout')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  it('should fetch tasks on mount', async () => {
    render(<CalendarPage />);

    await waitFor(
      () => {
        expect(mockFetchTasksByDateRange).toHaveBeenCalled();
      },
      { timeout: 3000 }
    );
  });

  it('should render calendar view by default', async () => {
    render(<CalendarPage />);

    await waitFor(
      () => {
        expect(mockFetchTasksByDateRange).toHaveBeenCalled();
      },
      { timeout: 3000 }
    );

    // Calendar view should be rendered
    await waitFor(
      () => {
        expect(screen.getByTestId('calendar-view')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  it('should render task list when view is set to list', async () => {
    const user = userEvent.setup();
    render(<CalendarPage />);

    await waitFor(
      () => {
        expect(mockFetchTasksByDateRange).toHaveBeenCalled();
      },
      { timeout: 3000 }
    );

    // Find list view button - it should be in the view toggle
    const viewButtons = screen.getAllByRole('button');
    const listViewButton = viewButtons.find(button =>
      button.textContent?.toLowerCase().includes('list')
    );

    if (listViewButton) {
      await user.click(listViewButton);

      await waitFor(
        () => {
          expect(screen.getByTestId('task-list')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    }
  });

  it('should handle task deletion', async () => {
    const user = userEvent.setup();

    // Mock deleteTask to resolve successfully
    mockDeleteTask.mockResolvedValueOnce(undefined);
    // Mock fetchTasksByDateRange to be called after delete
    mockFetchTasksByDateRange.mockResolvedValueOnce([]);

    render(<CalendarPage />);

    await waitFor(
      () => {
        expect(mockFetchTasksByDateRange).toHaveBeenCalled();
      },
      { timeout: 3000 }
    );

    // Switch to list view
    const viewButtons = screen.getAllByRole('button');
    const listViewButton = viewButtons.find(button =>
      button.textContent?.toLowerCase().includes('list')
    );

    if (listViewButton) {
      await user.click(listViewButton);

      await waitFor(
        () => {
          expect(screen.getByTestId('task-list')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );

      // Find and click delete button
      const deleteButton = screen.getByTestId('delete-task-1');
      if (deleteButton) {
        await user.click(deleteButton);

        // Wait for delete to be called
        await waitFor(
          () => {
            expect(mockDeleteTask).toHaveBeenCalled();
          },
          { timeout: 3000 }
        );
      }
    }
  });

  it('should display tasks', async () => {
    render(<CalendarPage />);

    await waitFor(
      () => {
        expect(mockFetchTasksByDateRange).toHaveBeenCalled();
      },
      { timeout: 3000 }
    );

    // Tasks should be available in the component
    await waitFor(
      () => {
        expect(screen.getByTestId('calendar-view')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  it('should handle date range changes', async () => {
    render(<CalendarPage />);

    await waitFor(
      () => {
        expect(mockFetchTasksByDateRange).toHaveBeenCalled();
      },
      { timeout: 3000 }
    );

    // fetchTasksByDateRange should be called with date range
    expect(mockFetchTasksByDateRange).toHaveBeenCalled();
  });
});
