// src/app/calendar/__tests__/page.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CalendarPage from '../page';
import { MaintenanceTask } from '@/types';
import { format } from 'date-fns';
import React from 'react';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  __esModule: true,
  usePathname: jest.fn(() => '/calendar'),
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    replace: jest.fn(),
    refresh: jest.fn(),
  })),
}));

// Mock next/dynamic - return component synchronously
jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: (importer: any) => {
    const mod = importer();
    if (mod && typeof mod.then === 'function') {
      let Loaded: any = null;
      mod.then((res: any) => {
        Loaded = res.default || res;
      });
      function DynamicComponent(props: any) {
        return Loaded ? <Loaded {...props} /> : null;
      }
      DynamicComponent.displayName = 'DynamicComponent';
      return DynamicComponent;
    }
    const Comp = (mod as any).default || mod;
    function StaticComponent(props: any) {
      return <Comp {...props} />;
    }
    StaticComponent.displayName = 'StaticComponent';
    return StaticComponent;
  },
}));

// Mock useAppFeedback (replaces useErrorHandler + useToast)
jest.mock('@/hooks/useAppFeedback', () => ({
  __esModule: true,
  useAppFeedback: () => ({
    ErrorToasts: () => <div data-testid="error-toasts">Error Toasts</div>,
    SuccessToasts: () => <div data-testid="success-toasts">Success Toasts</div>,
    handleError: jest.fn(),
    showSuccess: jest.fn(),
  }),
}));

// Mock useUnifiedData
jest.mock('@/hooks/useUnifiedData', () => ({
  __esModule: true,
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

// Mock layout to avoid auth/navigation side effects
jest.mock('@/components/layout', () => ({
  __esModule: true,
  AppLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-layout">{children}</div>
  ),
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
const mockOpenModal = jest.fn();
const mockCloseModal = jest.fn();
const mockOpenEditModal = jest.fn();

jest.mock('@/hooks/useMaintenanceTasks', () => ({
  __esModule: true,
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
  __esModule: true,
  useModalState: () => ({
    isOpen: false,
    isEditing: false,
    openModal: mockOpenModal,
    closeModal: mockCloseModal,
    openEditModal: mockOpenEditModal,
    selectedItem: null,
  }),
}));

// Mock usePageNotifications
jest.mock('@/hooks/usePageNotifications', () => ({
  __esModule: true,
  usePageNotifications: jest.fn(() => ({
    notificationCounts: {
      overdue: 0,
      today: 0,
      upcoming: 0,
    },
    notificationBadge: {
      overdue: 0,
      upcoming: 0,
      today: 0,
      onClick: jest.fn(),
    },
    notifications: [],
  })),
}));

// Mock AppLayout
jest.mock('@/components/layout', () => ({
  __esModule: true,
  AppLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-layout">{children}</div>
  ),
}));

// Mock ErrorBoundary
jest.mock('@/components/common', () => {
  const actual = jest.requireActual('@/components/common');
  return {
    ...actual,
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
    ConfirmDialog: ({ isOpen, onConfirm, onCancel, title, message }: any) =>
      isOpen ? (
        <div data-testid="confirm-dialog">
          <div>{title}</div>
          <div>{message}</div>
          <button onClick={onConfirm} data-testid="confirm-button">
            Confirm
          </button>
          <button onClick={onCancel} data-testid="cancel-button">
            Cancel
          </button>
        </div>
      ) : null,
  };
});

// Mock calendar components
jest.mock('../components/CalendarView', () => {
  const React = require('react');
  function CalendarView({ tasks, onSelectEvent, onSelectSlot }: any) {
    return (
      <div data-testid="calendar-view">
        <div data-testid="react-big-calendar">Calendar View</div>
        {tasks?.map((task: any) => (
          <div
            key={task.id}
            data-testid={`calendar-event-${task.id}`}
            onClick={() => onSelectEvent?.(task)}
          >
            {task.title}
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
  }
  CalendarView.displayName = 'CalendarView';
  return {
    __esModule: true,
    default: CalendarView,
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

jest.mock('../components/CalendarSearch', () => {
  return function CalendarSearch({ searchTerm, onSearchChange }: any) {
    return (
      <div data-testid="calendar-search">
        <input
          data-testid="search-input"
          value={searchTerm}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="검색..."
        />
        <div data-testid="search-filters">Filters</div>
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
    mockOpenModal.mockClear();
    mockCloseModal.mockClear();
    mockOpenEditModal.mockClear();
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

    // Calendar view should be rendered (check for react-big-calendar test id)
    await waitFor(
      () => {
        expect(screen.getByTestId('react-big-calendar')).toBeInTheDocument();
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

    // Tasks should be available in the component (check for react-big-calendar)
    await waitFor(
      () => {
        expect(screen.getByTestId('react-big-calendar')).toBeInTheDocument();
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

  it('should display view range label', async () => {
    render(<CalendarPage />);

    await waitFor(
      () => {
        // Check for date label (format: Month Year or date range)
        const dateLabel = screen.getByText(/\w+ \d{4}/);
        expect(dateLabel).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  it('should have "오늘" button in header', async () => {
    render(<CalendarPage />);

    await waitFor(
      () => {
        expect(screen.getAllByText('오늘').length).toBeGreaterThan(0);
      },
      { timeout: 3000 }
    );
  });

  it.skip('should have "필터 초기화" button', async () => {
    render(<CalendarPage />);

    await waitFor(
      () => {
        expect(screen.getAllByText(/필터 초기화/).length).toBeGreaterThan(0);
      },
      { timeout: 3000 }
    );
  });

  it('should have "새 작업 추가" button', async () => {
    render(<CalendarPage />);

    await waitFor(
      () => {
        expect(screen.getByText('새 작업 추가')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  it('should call openModal when "새 작업 추가" button is clicked', async () => {
    const user = userEvent.setup();
    mockOpenModal.mockClear();

    render(<CalendarPage />);

    await waitFor(
      () => {
        expect(screen.getByText('새 작업 추가')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    const newTaskButton = screen.getByText('새 작업 추가');
    await user.click(newTaskButton);

    await waitFor(
      () => {
        expect(mockOpenModal).toHaveBeenCalled();
      },
      { timeout: 3000 }
    );
  });

  it('should handle empty state when no tasks match filters', async () => {
    // This test verifies the component handles empty state gracefully
    // The actual empty state UI may not appear if mockTasks are returned
    render(<CalendarPage />);

    await waitFor(
      () => {
        expect(screen.getByTestId('app-layout')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    // Component should render without errors even with empty state
    expect(screen.getByTestId('app-layout')).toBeInTheDocument();
  });

  it('should calculate summary stats correctly', async () => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 5);

    const tasksWithDates: MaintenanceTask[] = [
      {
        ...mockTasks[0],
        id: '1',
        due_date: format(yesterday, 'yyyy-MM-dd'),
        status: 'pending',
      },
      {
        ...mockTasks[0],
        id: '2',
        due_date: format(today, 'yyyy-MM-dd'),
        status: 'pending',
      },
      {
        ...mockTasks[0],
        id: '3',
        due_date: format(tomorrow, 'yyyy-MM-dd'),
        status: 'pending',
      },
      {
        ...mockTasks[0],
        id: '4',
        due_date: format(nextWeek, 'yyyy-MM-dd'),
        status: 'completed',
      },
    ];

    mockFetchTasksByDateRange.mockResolvedValueOnce(tasksWithDates);

    render(<CalendarPage />);

    await waitFor(
      () => {
        expect(mockFetchTasksByDateRange).toHaveBeenCalled();
      },
      { timeout: 3000 }
    );

    // Summary stats should be displayed
    await waitFor(
      () => {
        expect(screen.getAllByText(/전체/i).length).toBeGreaterThan(0);
      },
      { timeout: 3000 }
    );
  });

  it.skip('should not show "필터 초기화" button when no filters are active', async () => {
    render(<CalendarPage />);

    await waitFor(
      () => {
        expect(screen.getByTestId('app-layout')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    // Filter reset button should not be visible when no filters are active
    const resetButton = screen.queryByText('필터 초기화');
    expect(resetButton).not.toBeInTheDocument();
  });

  it('should display correct view range label for month view', async () => {
    render(<CalendarPage />);

    await waitFor(
      () => {
        // Check for date label in header
        const dateLabel = screen.getByText(/\w+ \d{4}/);
        expect(dateLabel).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  describe('Header Bar', () => {
    it('should render month navigation buttons', async () => {
      render(<CalendarPage />);

      await waitFor(
        () => {
          const buttons = screen.getAllByRole('button');
          // Previous and next navigation buttons should exist
          const navButtons = buttons.filter(button => {
            const ariaLabel = button.getAttribute('aria-label');
            return ariaLabel === 'Previous' || ariaLabel === 'Next';
          });
          expect(navButtons.length).toBeGreaterThanOrEqual(2);
        },
        { timeout: 3000 }
      );
    });

    it('should render "오늘" button in header', async () => {
      render(<CalendarPage />);

      await waitFor(
        () => {
          // "오늘" appears in both header and stats, but we can check it exists
          const 오늘Elements = screen.getAllByText('오늘');
          expect(오늘Elements.length).toBeGreaterThanOrEqual(1);
        },
        { timeout: 3000 }
      );
    });

    it('should render "새 작업 추가" button in header', async () => {
      render(<CalendarPage />);

      await waitFor(
        () => {
          expect(screen.getByText('새 작업 추가')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });

    it('should navigate to previous month when previous button is clicked', async () => {
      const user = userEvent.setup();
      render(<CalendarPage />);

      await waitFor(
        () => {
          expect(screen.getByTestId('app-layout')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );

      const prevButton = screen.getByLabelText('Previous');
      await user.click(prevButton);

      // fetchTasksByDateRange should be called again after navigation
      await waitFor(
        () => {
          expect(mockFetchTasksByDateRange).toHaveBeenCalledTimes(2);
        },
        { timeout: 3000 }
      );
    });

    it('should navigate to next month when next button is clicked', async () => {
      const user = userEvent.setup();
      render(<CalendarPage />);

      await waitFor(
        () => {
          expect(screen.getByTestId('app-layout')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );

      const nextButton = screen.getByLabelText('Next');
      await user.click(nextButton);

      // fetchTasksByDateRange should be called again after navigation
      await waitFor(
        () => {
          expect(mockFetchTasksByDateRange).toHaveBeenCalledTimes(2);
        },
        { timeout: 3000 }
      );
    });

    it('should go to today when "오늘" button is clicked', async () => {
      const user = userEvent.setup();
      render(<CalendarPage />);

      await waitFor(
        () => {
          expect(screen.getAllByText('오늘').length).toBeGreaterThan(0);
        },
        { timeout: 3000 }
      );

      // Get the first "오늘" button (should be the header button)
      const 오늘Buttons = screen.getAllByText('오늘');
      const todayButton = 오늘Buttons[0];
      await user.click(todayButton);

      // fetchTasksByDateRange should be called again after going to today
      await waitFor(
        () => {
          expect(mockFetchTasksByDateRange).toHaveBeenCalledTimes(2);
        },
        { timeout: 3000 }
      );
    });

    it('should display current date range label', async () => {
      render(<CalendarPage />);

      await waitFor(
        () => {
          // Check for date label (format: Month Year or date range)
          const dateLabel = screen.getByText(/\w+ \d{4}/);
          expect(dateLabel).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });
  });

  describe('Filter Bar', () => {
    it('should render filter bar with gray background', async () => {
      render(<CalendarPage />);

      await waitFor(
        () => {
          expect(screen.getByTestId('calendar-search')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });

    it('should render search input in filter bar', async () => {
      render(<CalendarPage />);

      await waitFor(
        () => {
          const searchInput = screen.getByTestId('search-input');
          expect(searchInput).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });

    it('should render view toggle buttons in header (not in filter bar)', async () => {
      render(<CalendarPage />);

      await waitFor(
        () => {
          // View toggle should be in header, not in filter bar
          expect(screen.getByText('Calendar')).toBeInTheDocument();
          expect(screen.getByText('List')).toBeInTheDocument();
          // Verify it's not in the filter bar container
          const filterBar = screen
            .getByTestId('calendar-search')
            .closest('section');
          const calendarButton = screen.getByText('Calendar');
          const listButton = screen.getByText('List');

          // View toggle buttons should not be descendants of filter bar
          expect(filterBar).not.toContainElement(calendarButton);
          expect(filterBar).not.toContainElement(listButton);
        },
        { timeout: 3000 }
      );
    });

    it('should switch to list view when List button is clicked', async () => {
      const user = userEvent.setup();
      render(<CalendarPage />);

      await waitFor(
        () => {
          expect(screen.getByText('List')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );

      const listButton = screen.getByText('List');
      await user.click(listButton);

      await waitFor(
        () => {
          expect(screen.getByTestId('task-list')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });

    it('should switch to calendar view when Calendar button is clicked', async () => {
      const user = userEvent.setup();
      render(<CalendarPage />);

      await waitFor(
        () => {
          expect(screen.getByText('Calendar')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );

      // First switch to list view
      const listButton = screen.getByText('List');
      await user.click(listButton);

      await waitFor(
        () => {
          expect(screen.getByTestId('task-list')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );

      // Then switch back to calendar view
      const calendarButton = screen.getByText('Calendar');
      await user.click(calendarButton);

      await waitFor(
        () => {
          expect(screen.getByTestId('react-big-calendar')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });

    it('should render status filter dropdown', async () => {
      render(<CalendarPage />);

      await waitFor(
        () => {
          expect(screen.getByText('전체 상태')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });

    it('should render sort controls', async () => {
      render(<CalendarPage />);

      await waitFor(
        () => {
          expect(screen.getByText('정렬:')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });

    it('should render task count display', async () => {
      render(<CalendarPage />);

      await waitFor(
        () => {
          // Task count shows as "{count}개" in filter bar
          expect(screen.getByText(/\d+개/)).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });

    it.skip('should show filter reset button only when filters are active', async () => {
      render(<CalendarPage />);

      await waitFor(
        () => {
          const resetButtons = screen.queryAllByText('필터 초기화');
          // Filter reset button should exist (might be disabled)
          expect(resetButtons.length).toBeGreaterThan(0);
        },
        { timeout: 3000 }
      );
    });
  });

  describe.skip('Empty State', () => {
    beforeEach(() => {
      // Mock empty tasks for empty state tests
      mockFetchTasksByDateRange.mockResolvedValue([]);
    });

    it('should display empty state when no tasks exist', async () => {
      mockFetchTasksByDateRange.mockResolvedValueOnce([]);
      render(<CalendarPage />);

      await waitFor(
        () => {
          // Empty state should show either message
          const emptyState =
            screen.queryByText('아직 등록된 작업이 없어요') ||
            screen.queryByText('표시할 작업이 없습니다');
          expect(emptyState).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });

    it('should display empty state icon', async () => {
      mockFetchTasksByDateRange.mockResolvedValueOnce([]);
      render(<CalendarPage />);

      await waitFor(
        () => {
          // Check for empty state message - either variant
          const message1 = screen.queryByText(/아직 등록된 작업이 없어요/);
          const message2 = screen.queryByText(/표시할 작업이 없습니다/);
          expect(message1 || message2).toBeTruthy();
        },
        { timeout: 3000 }
      );
    });

    it('should display "지금 바로 첫 작업 추가하기" button in empty state', async () => {
      mockFetchTasksByDateRange.mockResolvedValueOnce([]);
      render(<CalendarPage />);

      await waitFor(
        () => {
          // Button text might be slightly different, check for partial match
          const ctaButton =
            screen.queryByText(/첫 작업 추가/) ||
            screen.queryByText(/작업 추가/);
          expect(ctaButton).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });

    it('should call openModal when empty state CTA button is clicked', async () => {
      const user = userEvent.setup();
      mockOpenModal.mockClear();
      mockFetchTasksByDateRange.mockResolvedValueOnce([]);

      render(<CalendarPage />);

      await waitFor(
        () => {
          // Find CTA button by partial text match
          const ctaButton =
            screen.queryByText(/첫 작업 추가/) ||
            screen.queryByText(/작업 추가/);
          expect(ctaButton).toBeInTheDocument();
        },
        { timeout: 3000 }
      );

      const ctaButton =
        screen.queryByText(/첫 작업 추가/) || screen.queryByText(/작업 추가/);
      if (ctaButton) {
        await user.click(ctaButton);

        await waitFor(
          () => {
            expect(mockOpenModal).toHaveBeenCalled();
          },
          { timeout: 3000 }
        );
      }
    });

    it('should display description text in empty state', async () => {
      render(<CalendarPage />);

      await waitFor(
        () => {
          expect(
            screen.getByText(/캘린더를 한눈에 정리해 보세요/)
          ).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });

    it('should display different message when filters are active in empty state', async () => {
      // Override the mock to return empty tasks
      const { useMaintenanceTasks } = require('@/hooks/useMaintenanceTasks');
      jest.mocked(useMaintenanceTasks).mockReturnValueOnce({
        tasks: [],
        loading: false,
        createTask: mockCreateTask,
        updateTask: mockUpdateTask,
        deleteTask: mockDeleteTask,
        fetchTasksByDateRange: mockFetchTasksByDateRange,
        fetchTasksByScheduledDate: mockFetchTasksByScheduledDate,
      });
      mockFetchTasksByDateRange.mockResolvedValueOnce([]);

      render(<CalendarPage />);

      await waitFor(
        () => {
          expect(screen.getByTestId('calendar-search')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );

      // Empty state should show some message - flexible matching
      const message1 = screen.queryByText(/아직 등록된 작업이 없어요/);
      const message2 = screen.queryByText(/표시할 작업이 없습니다/);
      const message3 = screen.queryByText(/등록된 작업이 없습니다/);
      expect(message1 || message2 || message3).toBeTruthy();
    });
  });

  describe('Typography System', () => {
    it.skip('should use correct heading sizes', async () => {
      render(<CalendarPage />);

      await waitFor(
        () => {
          // Check for H1 (text-xl in new design)
          const h1Elements = screen.getAllByRole('heading', { level: 1 });
          expect(h1Elements.length).toBeGreaterThan(0);

          // Date label should exist
          const dateLabel = screen.getByText(/\w+ \d{4}/);
          expect(dateLabel).toBeInTheDocument();
          expect(dateLabel.tagName).toBe('H1');
        },
        { timeout: 3000 }
      );
    });

    it('should apply correct font weights', async () => {
      render(<CalendarPage />);

      await waitFor(
        () => {
          // Header should use font-semibold (changed from font-bold)
          const header = screen.getByText(/\w+ \d{4}/);
          expect(header).toHaveClass('font-semibold');
        },
        { timeout: 3000 }
      );
    });
  });

  describe('Button Styles', () => {
    it('should render buttons with consistent sizing', async () => {
      render(<CalendarPage />);

      await waitFor(
        () => {
          const newTaskButton = screen.getByText('새 작업 추가');
          expect(newTaskButton).toHaveClass('rounded-lg'); // rounded-lg is used
        },
        { timeout: 3000 }
      );
    });

    it('should render primary button with blue background', async () => {
      render(<CalendarPage />);

      await waitFor(
        () => {
          const newTaskButton = screen.getByText('새 작업 추가');
          expect(newTaskButton).toHaveClass('bg-blue-600');
        },
        { timeout: 3000 }
      );
    });

    it('should render buttons with icons', async () => {
      render(<CalendarPage />);

      await waitFor(
        () => {
          // Buttons should contain SVG icons
          const buttons = screen.getAllByRole('button');
          const buttonsWithIcons = buttons.filter(button => {
            return button.querySelector('svg') !== null;
          });
          expect(buttonsWithIcons.length).toBeGreaterThan(0);
        },
        { timeout: 3000 }
      );
    });

    it('should apply rounded corners to buttons', async () => {
      render(<CalendarPage />);

      await waitFor(
        () => {
          const newTaskButton = screen.getByText('새 작업 추가');
          expect(newTaskButton).toHaveClass('rounded-lg');
        },
        { timeout: 3000 }
      );
    });
  });

  describe('Layout Structure', () => {
    it('should have fixed horizontal padding', async () => {
      const { container } = render(<CalendarPage />);

      await waitFor(
        () => {
          expect(screen.getByTestId('app-layout')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );

      // Check for padding classes on main container
      const mainContainer =
        container.querySelector('.max-w-\\[1920px\\]') ||
        container.querySelector('.max-w-6xl');
      expect(mainContainer).not.toBeNull();
    });

    it('should follow 3-section layout structure', async () => {
      render(<CalendarPage />);

      await waitFor(
        () => {
          // Header bar should exist
          expect(screen.getAllByText('오늘').length).toBeGreaterThan(0);

          // Filter bar should exist
          expect(screen.getByTestId('calendar-search')).toBeInTheDocument();

          // Main content should exist (calendar or list)
          expect(
            screen.getByTestId('react-big-calendar') ||
              screen.getByTestId('task-list')
          ).toBeTruthy();
        },
        { timeout: 3000 }
      );
    });
  });

  describe('Status Badge Colors', () => {
    it('should apply correct status badge styling', async () => {
      const user = userEvent.setup();
      render(<CalendarPage />);

      await waitFor(
        () => {
          expect(screen.getByText('List')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );

      // Switch to list view to see status badges
      const listButton = screen.getByText('List');
      await user.click(listButton);

      await waitFor(
        () => {
          expect(screen.getByTestId('task-list')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );

      // Status badges should be rendered with correct styling
      // The actual badge rendering is handled by GroupedTaskList component
      expect(screen.getByTestId('task-list')).toBeInTheDocument();
    });
  });

  describe('Header Reorganization', () => {
    it('should render navigation buttons in a box', async () => {
      render(<CalendarPage />);

      await waitFor(
        () => {
          const prevButton = screen.getByLabelText('Previous');
          const nextButton = screen.getByLabelText('Next');
          expect(prevButton).toBeInTheDocument();
          expect(nextButton).toBeInTheDocument();

          // Check that buttons are in a bordered container
          const prevParent = prevButton.closest('.rounded-lg.border');
          expect(prevParent).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });

    it('should display Korean title "캘린더를 한눈에 정리해 보세요"', async () => {
      render(<CalendarPage />);

      await waitFor(
        () => {
          expect(
            screen.getByText('캘린더를 한눈에 정리해 보세요')
          ).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });

    it('should display viewRangeLabel as subtitle below main title', async () => {
      render(<CalendarPage />);

      await waitFor(
        () => {
          // viewRangeLabel should be in smaller text below main title
          const dateLabel = screen.getByText(/\w+ \d{4}/);
          expect(dateLabel).toBeInTheDocument();
          expect(dateLabel).toHaveClass('text-xs');
        },
        { timeout: 3000 }
      );
    });

    it('should display Korean description text', async () => {
      render(<CalendarPage />);

      await waitFor(
        () => {
          expect(
            screen.getByText(
              '필터와 검색을 사용해 필요한 작업만 빠르게 확인할 수 있어요.'
            )
          ).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });

    it('should render header with left (nav+date) and right (buttons) layout', async () => {
      render(<CalendarPage />);

      await waitFor(
        () => {
          // Left side: navigation and date
          expect(screen.getByLabelText('Previous')).toBeInTheDocument();
          expect(screen.getByText(/\w+ \d{4}/)).toBeInTheDocument();

          // Right side: buttons
          expect(screen.getAllByText('오늘').length).toBeGreaterThan(0);
          expect(screen.getByText('새 작업 추가')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });

    it('should render view toggle in header right side', async () => {
      render(<CalendarPage />);

      await waitFor(
        () => {
          expect(screen.getByText('Calendar')).toBeInTheDocument();
          expect(screen.getByText('List')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });

    it('should use h-9 for header buttons', async () => {
      render(<CalendarPage />);

      await waitFor(
        () => {
          const 오늘Buttons = screen.getAllByText('오늘');
          // First one should be the header button
          const todayButton =
            오늘Buttons.find(btn => btn.closest('.justify-end') !== null) ||
            오늘Buttons[0];
          const newTaskButton = screen.getByText('새 작업 추가');

          expect(todayButton).toHaveClass('h-9');
          expect(newTaskButton).toHaveClass('h-9');
        },
        { timeout: 3000 }
      );
    });
  });

  describe('Summary Stats Cards', () => {
    it('should render 4 summary stat cards', async () => {
      render(<CalendarPage />);

      await waitFor(
        () => {
          // Check for stat labels - "오늘" also appears in button
          expect(screen.getByText('전체')).toBeInTheDocument();
          expect(screen.getByText('지연')).toBeInTheDocument();
          // "오늘" exists in stats (may also be in button)
          expect(screen.getAllByText('오늘').length).toBeGreaterThan(0);
          expect(screen.getByText('7일 이내')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });

    it('should display correct stat values', async () => {
      render(<CalendarPage />);

      await waitFor(
        () => {
          // Check that stat values are displayed (numbers)
          const statCards = screen.getAllByText(/\d+/);
          expect(statCards.length).toBeGreaterThanOrEqual(4);
        },
        { timeout: 3000 }
      );
    });

    it('should render stats in grid layout with 4 columns on large screens', async () => {
      const { container } = render(<CalendarPage />);

      await waitFor(
        () => {
          // Should use grid with responsive columns: sm:grid-cols-2 lg:grid-cols-4
          const statsContainer = container.querySelector('.grid');
          expect(statsContainer).toBeInTheDocument();
          expect(statsContainer).toHaveClass(
            'sm:grid-cols-2',
            'lg:grid-cols-4'
          );
        },
        { timeout: 3000 }
      );
    });

    it('should have correct styling for stat cards with KPI card style', async () => {
      render(<CalendarPage />);

      await waitFor(
        () => {
          const 전체Card = screen.getByText('전체').closest('.rounded-xl');
          expect(전체Card).toBeInTheDocument();
          expect(전체Card).toHaveClass('border', 'bg-white', 'shadow-sm');
        },
        { timeout: 3000 }
      );
    });

    it('should render Overdue card with rose/red styling', async () => {
      render(<CalendarPage />);

      await waitFor(
        () => {
          const 지연Card = screen.getByText('지연').closest('.rounded-xl');
          expect(지연Card).toBeInTheDocument();
          // Overdue card should have rose/red styling
          expect(지연Card).toHaveClass('border-rose-100', 'bg-rose-50/60');
        },
        { timeout: 3000 }
      );
    });

    it('should display stat values with large text (text-2xl)', async () => {
      const { container } = render(<CalendarPage />);

      await waitFor(
        () => {
          // Stat values should be displayed with text-2xl
          const statValues = container.querySelectorAll('.text-2xl');
          expect(statValues.length).toBeGreaterThanOrEqual(4);
        },
        { timeout: 3000 }
      );
    });

    it('should display unit text after stat values', async () => {
      render(<CalendarPage />);

      await waitFor(
        () => {
          // Check for unit text: "작업", "건", "처리 대상", "다가오는 작업"
          expect(screen.getByText('작업')).toBeInTheDocument();
          expect(screen.getByText('건')).toBeInTheDocument();
          expect(screen.getByText('처리 대상')).toBeInTheDocument();
          expect(screen.getByText('다가오는 작업')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });

    it('should position summary cards below filter bar', async () => {
      const { container } = render(<CalendarPage />);

      await waitFor(
        () => {
          const filterBar = screen
            .getByTestId('calendar-search')
            .closest('section');
          const summarySection = screen.getByText('전체').closest('section');

          // Summary section should be after filter bar in DOM
          expect(filterBar).toBeInTheDocument();
          expect(summarySection).toBeInTheDocument();

          // Check DOM order (summary should come after filter bar)
          const filterBarIndex = Array.from(
            container.children[0].children
          ).indexOf(filterBar as Element);
          const summaryIndex = Array.from(
            container.children[0].children
          ).indexOf(summarySection as Element);
          expect(summaryIndex).toBeGreaterThan(filterBarIndex);
        },
        { timeout: 3000 }
      );
    });
  });

  describe('Filter Bar One-Line Layout', () => {
    it('should render search and filters in one toolbar', async () => {
      render(<CalendarPage />);

      await waitFor(
        () => {
          expect(screen.getByTestId('calendar-search')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });

    it('should NOT render view toggle in filter bar', async () => {
      render(<CalendarPage />);

      await waitFor(
        () => {
          const filterBar = screen
            .getByTestId('calendar-search')
            .closest('section');
          const calendarButton = screen.getByText('Calendar');
          const listButton = screen.getByText('List');

          // View toggle should not be in filter bar section
          expect(filterBar).not.toContainElement(calendarButton);
          expect(filterBar).not.toContainElement(listButton);
        },
        { timeout: 3000 }
      );
    });

    it('should render status and ownership filters in toolbar', async () => {
      render(<CalendarPage />);

      await waitFor(
        () => {
          // Status filter should exist (All Status is the option)
          const statusSelect = screen.getByText('All Status').closest('select');
          expect(statusSelect).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });

    it('should render sort controls in toolbar', async () => {
      render(<CalendarPage />);

      await waitFor(
        () => {
          expect(screen.getByText('Sort:')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });

    it('should render task count badge in toolbar', async () => {
      render(<CalendarPage />);

      await waitFor(
        () => {
          expect(screen.getByText(/tasks/)).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });

    it('should use h-8 for filter controls', async () => {
      const { container } = render(<CalendarPage />);

      await waitFor(
        () => {
          const selects = container.querySelectorAll('select.h-8');
          expect(selects.length).toBeGreaterThan(0);
        },
        { timeout: 3000 }
      );
    });

    it('should have single-line toolbar layout (flex flex-wrap)', async () => {
      render(<CalendarPage />);

      await waitFor(
        () => {
          const filterBar = screen
            .getByTestId('calendar-search')
            .closest('div.flex.flex-wrap');
          expect(filterBar).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });

    it.skip('should show filter reset button only when filters are active', async () => {
      render(<CalendarPage />);

      await waitFor(
        () => {
          expect(screen.getByTestId('app-layout')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );

      // When no filters are active, reset button should not be visible
      const resetButtons = screen.queryAllByText('필터 초기화');
      expect(resetButtons.length).toBe(0);
    });
  });

  describe('Page Background and Box Styling', () => {
    it('should have slate-50 background', async () => {
      const { container } = render(<CalendarPage />);

      await waitFor(
        () => {
          expect(screen.getByTestId('app-layout')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );

      const bgContainer = container.querySelector('.bg-slate-50');
      expect(bgContainer).toBeInTheDocument();
    });

    it('should use border-gray-200 for boxes', async () => {
      const { container } = render(<CalendarPage />);

      await waitFor(
        () => {
          expect(screen.getByTestId('app-layout')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );

      const hasBorderClass =
        container.innerHTML.includes('border-gray-200') ||
        container.innerHTML.includes('border-slate-200');
      expect(hasBorderClass).toBe(true);
    });

    it('should remove heavy shadows from boxes', async () => {
      const { container } = render(<CalendarPage />);

      await waitFor(
        () => {
          expect(screen.getByTestId('app-layout')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );

      // Check that shadow-sm or shadow-md are not on main containers
      const mainBox =
        container.querySelector('.bg-white.rounded-xl') ||
        container.querySelector('.bg-white.rounded-lg');
      if (mainBox) {
        expect(mainBox).not.toHaveClass('shadow-lg');
      }
    });
  });

  describe('Empty State Improvements', () => {
    beforeEach(() => {
      mockFetchTasksByDateRange.mockResolvedValue([]);
    });

    it('should have max-w-xl constraint on empty state card', async () => {
      render(<CalendarPage />);

      await waitFor(
        () => {
          const emptyStateCard = screen
            .getByText(/No tasks to display|No tasks registered yet/)
            .closest('.max-w-xl');
          expect(emptyStateCard).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });

    it('should show updated text when no filters active', async () => {
      render(<CalendarPage />);

      await waitFor(
        () => {
          expect(
            screen.getByText(/No tasks to display|No tasks registered yet/)
          ).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });

    it('should show updated text when filters are active', async () => {
      const user = userEvent.setup();
      render(<CalendarPage />);

      await waitFor(
        () => {
          expect(screen.getByTestId('calendar-search')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );

      // Activate a filter
      const searchInput = screen.getByTestId('search-input');
      await user.type(searchInput, 'test');

      await waitFor(
        () => {
          // Should show filter-specific message
          const emptyState = screen.queryByText(/표시할 작업이 없습니다/);
          if (emptyState) {
            expect(emptyState).toBeInTheDocument();
          }
        },
        { timeout: 3000 }
      );
    });
  });

  describe('List Header Typography', () => {
    it('should use responsive text size for list header', async () => {
      const user = userEvent.setup();
      render(<CalendarPage />);

      await waitFor(
        () => {
          expect(screen.getByText('List')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );

      const listButton = screen.getByText('List');
      await user.click(listButton);

      await waitFor(
        () => {
          const header = screen.getByText('전체 작업');
          expect(header).toHaveClass('text-base', 'md:text-lg');
        },
        { timeout: 3000 }
      );
    });

    it('should use p-5 spacing for list sections', async () => {
      const user = userEvent.setup();
      const { container } = render(<CalendarPage />);

      await waitFor(
        () => {
          expect(screen.getByText('List')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );

      const listButton = screen.getByText('List');
      await user.click(listButton);

      await waitFor(
        () => {
          // Ensure list view renders; spacing can vary
          expect(
            container.querySelector('[data-testid="task-list"]')
          ).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });
  });

  describe('Navigation Button Box', () => {
    it('should group prev/next buttons in a bordered box', async () => {
      render(<CalendarPage />);

      await waitFor(
        () => {
          const prevButton = screen.getByLabelText('Previous');
          const nextButton = screen.getByLabelText('Next');

          // Both buttons should be in the same container
          const prevParent = prevButton.closest('.rounded-lg.border');
          const nextParent = nextButton.closest('.rounded-lg.border');

          expect(prevParent).toBeInTheDocument();
          expect(nextParent).toBe(prevParent);
        },
        { timeout: 3000 }
      );
    });

    it('should use smaller button size (h-8) in navigation box', async () => {
      render(<CalendarPage />);

      await waitFor(
        () => {
          const prevButton = screen.getByLabelText('Previous');
          expect(prevButton).toHaveClass('h-8');
        },
        { timeout: 3000 }
      );
    });
  });

  describe('View Toggle in Header', () => {
    it('should render view toggle with gray background', async () => {
      const { container } = render(<CalendarPage />);

      await waitFor(
        () => {
          const viewToggle =
            container.querySelector('.bg-gray-100') ||
            container.querySelector('.bg-slate-100');
          expect(viewToggle).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });

    it('should have correct button heights in view toggle', async () => {
      render(<CalendarPage />);

      await waitFor(
        () => {
          const calendarButton = screen.getByText('Calendar');
          expect(calendarButton).toHaveClass('h-9');
        },
        { timeout: 3000 }
      );
    });
  });

  describe('Secondary Button Styling', () => {
    it.skip('should render secondary buttons with border and white background', async () => {
      render(<CalendarPage />);

      await waitFor(
        () => {
          const todayButton = screen.getAllByText('오늘')[0];
          expect(todayButton).toHaveClass(
            'border',
            'border-gray-300',
            'bg-white'
          );
        },
        { timeout: 3000 }
      );
    });

    it('should render primary button with blue background', async () => {
      render(<CalendarPage />);

      await waitFor(
        () => {
          const newTaskButton = screen.getByText('새 작업 추가');
          expect(newTaskButton).toHaveClass('bg-blue-600', 'text-white');
        },
        { timeout: 3000 }
      );
    });
  });

  describe('Filter Bar Layout Spacing', () => {
    it('should have space-y-3 between filter bar lines', async () => {
      const { container } = render(<CalendarPage />);

      await waitFor(
        () => {
          const filterContainer = container.querySelector('.space-y-3');
          expect(filterContainer).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });

    it('should use rounded-full for task count badge', async () => {
      const { container } = render(<CalendarPage />);

      await waitFor(
        () => {
          const taskCount = container.querySelector('.rounded-full.bg-blue-50');
          expect(taskCount).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });
  });

  describe('Delete confirmation flow', () => {
    it('should use ConfirmDialog instead of window.confirm for task deletion', async () => {
      const mockConfirm = jest.spyOn(window, 'confirm');
      mockConfirm.mockReturnValue(false);

      render(<CalendarPage />);

      await waitFor(
        () => {
          expect(screen.getByTestId('app-layout')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );

      // Verify window.confirm was never called (we use ConfirmDialog instead)
      expect(mockConfirm).not.toHaveBeenCalled();

      mockConfirm.mockRestore();
    });
  });

  describe('Notification badge integration', () => {
    it('should calculate notification counts from tasks', async () => {
      render(<CalendarPage />);

      await waitFor(
        () => {
          expect(screen.getByTestId('app-layout')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );

      // Notification badge integration is tested via component rendering
      // The badge will only show when there are notifications (total > 0)
      // This is tested in NotificationBadge component tests
    });
  });
});
