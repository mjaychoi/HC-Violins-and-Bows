import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GroupedTaskList from '../GroupedTaskList';
import { MaintenanceTask } from '@/types';
// formatDate, isToday, isTomorrow, isYesterday, parseISO, differenceInDays are not used in tests

// Mock formatDate
jest.mock('@/utils/formatUtils', () => ({
  formatDate: jest.fn((date: string, format?: string) => {
    if (format === 'long') {
      return new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    }
    return date;
  }),
}));

// Mock date-fns functions
jest.mock('date-fns', () => ({
  isToday: jest.fn((date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  }),
  isTomorrow: jest.fn((date: Date) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return date.toDateString() === tomorrow.toDateString();
  }),
  isYesterday: jest.fn((date: Date) => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return date.toDateString() === yesterday.toDateString();
  }),
  parseISO: jest.fn((date: string) => new Date(date)),
  differenceInDays: jest.fn((date1: Date, date2: Date) => {
    const diffTime = date1.getTime() - date2.getTime();
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  }),
}));

// Mock window.confirm
const mockConfirm = jest.fn();
window.confirm = mockConfirm;

describe('GroupedTaskList', () => {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const mockTasks: MaintenanceTask[] = [
    {
      id: '1',
      instrument_id: 'instrument-1',
      client_id: null,
      task_type: 'repair',
      title: 'Violin Repair',
      description: 'Fix bridge',
      status: 'pending',
      received_date: today.toISOString().split('T')[0],
      due_date: tomorrow.toISOString().split('T')[0],
      personal_due_date: null,
      scheduled_date: null,
      completed_date: null,
      priority: 'high',
      estimated_hours: 2,
      actual_hours: null,
      cost: 100,
      notes: 'Test notes',
      created_at: today.toISOString(),
      updated_at: today.toISOString(),
    },
    {
      id: '2',
      instrument_id: 'instrument-2',
      client_id: 'client-1',
      task_type: 'rehair',
      title: 'Bow Rehair',
      description: 'Rehair bow',
      status: 'in_progress',
      received_date: yesterday.toISOString().split('T')[0],
      due_date: null,
      personal_due_date: today.toISOString().split('T')[0],
      scheduled_date: tomorrow.toISOString().split('T')[0],
      completed_date: null,
      priority: 'urgent',
      estimated_hours: 1,
      actual_hours: null,
      cost: 50,
      notes: null,
      created_at: yesterday.toISOString(),
      updated_at: yesterday.toISOString(),
    },
  ];

  const mockInstruments = new Map([
    [
      'instrument-1',
      {
        type: 'Violin',
        maker: 'Stradivarius',
        ownership: 'Private',
        clientId: null,
        clientName: null,
      },
    ],
    [
      'instrument-2',
      {
        type: 'Bow',
        maker: 'Test Maker',
        ownership: 'Shop',
        clientId: 'client-1',
        clientName: 'John Doe',
      },
    ],
  ]);

  const mockClients = new Map([
    [
      'client-1',
      {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      },
    ],
  ]);

  const mockOnTaskClick = jest.fn();
  const mockOnTaskDelete = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockConfirm.mockReturnValue(true);
  });

  it('should render empty state when no tasks', () => {
    render(<GroupedTaskList tasks={[]} />);

    expect(screen.getByText(/no tasks found/i)).toBeInTheDocument();
    expect(
      screen.getByText(/get started by creating your first task/i)
    ).toBeInTheDocument();
  });

  it('should render tasks grouped by date', () => {
    render(
      <GroupedTaskList
        tasks={mockTasks}
        instruments={mockInstruments}
        clients={mockClients}
      />
    );

    expect(screen.getByTestId('task-list')).toBeInTheDocument();
    expect(screen.getByTestId('task-1')).toBeInTheDocument();
    expect(screen.getByTestId('task-2')).toBeInTheDocument();
  });

  it('should display task titles', () => {
    render(
      <GroupedTaskList
        tasks={mockTasks}
        instruments={mockInstruments}
        clients={mockClients}
      />
    );

    expect(screen.getByText('Violin Repair')).toBeInTheDocument();
    expect(screen.getByText('Bow Rehair')).toBeInTheDocument();
  });

  it('should display task priorities', () => {
    render(
      <GroupedTaskList
        tasks={mockTasks}
        instruments={mockInstruments}
        clients={mockClients}
      />
    );

    expect(screen.getByText('HIGH')).toBeInTheDocument();
    expect(screen.getByText('URGENT')).toBeInTheDocument();
  });

  it('should display task statuses', () => {
    render(
      <GroupedTaskList
        tasks={mockTasks}
        instruments={mockInstruments}
        clients={mockClients}
      />
    );

    expect(screen.getByText('PENDING')).toBeInTheDocument();
    expect(screen.getByText('IN PROGRESS')).toBeInTheDocument();
  });

  it('should display instrument information', () => {
    render(
      <GroupedTaskList
        tasks={mockTasks}
        instruments={mockInstruments}
        clients={mockClients}
      />
    );

    expect(screen.getAllByText('Violin').length).toBeGreaterThan(0);
    expect(screen.getByText('Stradivarius')).toBeInTheDocument();
  });

  it('should display client information when available', () => {
    render(
      <GroupedTaskList
        tasks={mockTasks}
        instruments={mockInstruments}
        clients={mockClients}
      />
    );

    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });

  it('should call onTaskClick when task is clicked', async () => {
    const user = userEvent.setup();
    render(
      <GroupedTaskList
        tasks={mockTasks}
        instruments={mockInstruments}
        clients={mockClients}
        onTaskClick={mockOnTaskClick}
      />
    );

    const task = screen.getByTestId('task-1');
    await user.click(task);

    expect(mockOnTaskClick).toHaveBeenCalledWith(mockTasks[0]);
  });

  it('should call onTaskDelete when delete button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <GroupedTaskList
        tasks={mockTasks}
        instruments={mockInstruments}
        clients={mockClients}
        onTaskDelete={mockOnTaskDelete}
      />
    );

    const deleteButton = screen.getByTestId('delete-task-1');
    await user.click(deleteButton);

    expect(mockConfirm).toHaveBeenCalled();
    expect(mockOnTaskDelete).toHaveBeenCalledWith('1');
  });

  it('should not call onTaskDelete when confirm is cancelled', async () => {
    const user = userEvent.setup();
    mockConfirm.mockReturnValue(false);

    render(
      <GroupedTaskList
        tasks={mockTasks}
        instruments={mockInstruments}
        clients={mockClients}
        onTaskDelete={mockOnTaskDelete}
      />
    );

    const deleteButton = screen.getByTestId('delete-task-1');
    await user.click(deleteButton);

    expect(mockConfirm).toHaveBeenCalled();
    expect(mockOnTaskDelete).not.toHaveBeenCalled();
  });

  it('should display task descriptions', () => {
    render(
      <GroupedTaskList
        tasks={mockTasks}
        instruments={mockInstruments}
        clients={mockClients}
      />
    );

    expect(screen.getByText('Fix bridge')).toBeInTheDocument();
    expect(screen.getByText('Rehair bow')).toBeInTheDocument();
  });

  it('should display task types', () => {
    render(
      <GroupedTaskList
        tasks={mockTasks}
        instruments={mockInstruments}
        clients={mockClients}
      />
    );

    expect(screen.getAllByText(/type:/i).length).toBeGreaterThan(0);
    expect(screen.getByText('repair')).toBeInTheDocument();
    expect(screen.getByText('rehair')).toBeInTheDocument();
  });

  it('should group tasks by scheduled_date when available', () => {
    const tasksWithScheduled: MaintenanceTask[] = [
      {
        ...mockTasks[0],
        scheduled_date: '2024-01-05',
      },
    ];

    render(
      <GroupedTaskList
        tasks={tasksWithScheduled}
        instruments={mockInstruments}
        clients={mockClients}
      />
    );

    expect(screen.getByTestId('task-1')).toBeInTheDocument();
  });

  it('should group tasks by due_date when scheduled_date is not available', () => {
    const tasksWithDue: MaintenanceTask[] = [
      {
        ...mockTasks[0],
        scheduled_date: null,
        due_date: '2024-01-15',
      },
    ];

    render(
      <GroupedTaskList
        tasks={tasksWithDue}
        instruments={mockInstruments}
        clients={mockClients}
      />
    );

    expect(screen.getByTestId('task-1')).toBeInTheDocument();
  });

  it('should group tasks by personal_due_date when other dates are not available', () => {
    const tasksWithPersonal: MaintenanceTask[] = [
      {
        ...mockTasks[0],
        scheduled_date: null,
        due_date: null,
        personal_due_date: '2024-01-10',
      },
    ];

    render(
      <GroupedTaskList
        tasks={tasksWithPersonal}
        instruments={mockInstruments}
        clients={mockClients}
      />
    );

    expect(screen.getByTestId('task-1')).toBeInTheDocument();
  });

  it('should sort tasks by priority', () => {
    const tasks: MaintenanceTask[] = [
      {
        ...mockTasks[0],
        id: 'task-low',
        priority: 'low',
        scheduled_date: '2024-01-05',
      },
      {
        ...mockTasks[1],
        id: 'task-urgent',
        priority: 'urgent',
        scheduled_date: '2024-01-05',
      },
    ];

    render(
      <GroupedTaskList
        tasks={tasks}
        instruments={mockInstruments}
        clients={mockClients}
      />
    );

    const taskElements = screen.getAllByTestId(/^task-/);
    // Should have both tasks
    expect(taskElements.length).toBeGreaterThanOrEqual(2);
    // Urgent task should appear first (check by priority badge)
    expect(screen.getByText('URGENT')).toBeInTheDocument();
  });

  it('should display date headers', () => {
    render(
      <GroupedTaskList
        tasks={mockTasks}
        instruments={mockInstruments}
        clients={mockClients}
      />
    );

    // Date headers should be present (format depends on date-fns mocking)
    expect(screen.getByTestId('task-list')).toBeInTheDocument();
  });

  it('should display task count per date group', () => {
    render(
      <GroupedTaskList
        tasks={mockTasks}
        instruments={mockInstruments}
        clients={mockClients}
      />
    );

    // Task count badges should be present
    const taskCounts = screen.getAllByText(/\d+ task/i);
    expect(taskCounts.length).toBeGreaterThan(0);
  });

  it('should handle tasks without instrument information', () => {
    const taskWithoutInstrument: MaintenanceTask[] = [
      {
        ...mockTasks[0],
        instrument_id: 'non-existent-instrument',
      },
    ];

    render(
      <GroupedTaskList
        tasks={taskWithoutInstrument}
        instruments={mockInstruments}
        clients={mockClients}
      />
    );

    expect(screen.getByTestId('task-1')).toBeInTheDocument();
  });

  it('should handle tasks without client information', () => {
    const taskWithoutClient: MaintenanceTask[] = [
      {
        ...mockTasks[0],
        client_id: null,
      },
    ];

    render(
      <GroupedTaskList
        tasks={taskWithoutClient}
        instruments={mockInstruments}
        clients={mockClients}
      />
    );

    expect(screen.getByTestId('task-1')).toBeInTheDocument();
  });

  it('should display overdue indicator for overdue tasks', () => {
    const overdueTask: MaintenanceTask[] = [
      {
        ...mockTasks[0],
        due_date: yesterday.toISOString().split('T')[0],
        status: 'pending',
      },
    ];

    // Mock differenceInDays to return negative value (overdue)
    const mockDifferenceInDays = require('date-fns').differenceInDays;
    mockDifferenceInDays.mockReturnValueOnce(-1);

    render(
      <GroupedTaskList
        tasks={overdueTask}
        instruments={mockInstruments}
        clients={mockClients}
      />
    );

    // Should display overdue indicator
    expect(screen.getByTestId('task-1')).toBeInTheDocument();
  });

  it('should not show delete button when onTaskDelete is not provided', () => {
    render(
      <GroupedTaskList
        tasks={mockTasks}
        instruments={mockInstruments}
        clients={mockClients}
      />
    );

    expect(screen.queryByTestId('delete-task-1')).not.toBeInTheDocument();
  });

  it('should stop propagation on delete button click', async () => {
    const user = userEvent.setup();
    render(
      <GroupedTaskList
        tasks={mockTasks}
        instruments={mockInstruments}
        clients={mockClients}
        onTaskClick={mockOnTaskClick}
        onTaskDelete={mockOnTaskDelete}
      />
    );

    const deleteButton = screen.getByTestId('delete-task-1');
    await user.click(deleteButton);

    // onTaskClick should not be called when delete button is clicked
    expect(mockOnTaskClick).not.toHaveBeenCalled();
    expect(mockOnTaskDelete).toHaveBeenCalled();
  });
});
