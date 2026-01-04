import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TaskRowCollapsed from '../TaskRowCollapsed';
import type { MaintenanceTask } from '@/types';

// Mock child components
jest.mock('../StatusPill', () => ({
  __esModule: true,
  default: ({ task, isOverdue, isUpcoming }: any) => (
    <span data-testid="status-pill">
      {task.status} {isOverdue ? '(Overdue)' : ''}{' '}
      {isUpcoming ? '(Upcoming)' : ''}
    </span>
  ),
}));

jest.mock('../PriorityPill', () => ({
  __esModule: true,
  default: ({ priority }: any) => (
    <span data-testid="priority-pill">{priority}</span>
  ),
}));

jest.mock('@/hooks/useInlineEdit', () => ({
  useInlineEdit: jest.fn(() => ({
    editingId: null,
    isSaving: false,
    startEditing: jest.fn(),
    updateField: jest.fn(),
    saveEditing: jest.fn(),
    cancelEditing: jest.fn(),
  })),
}));

jest.mock('@/utils/tasks/style', () => ({
  getDateStatus: jest.fn(() => ({
    status: 'normal',
    days: 0,
  })),
}));

const makeTask = (
  overrides: Partial<MaintenanceTask> = {}
): MaintenanceTask => ({
  id: 'task-1',
  instrument_id: 'inst-1',
  client_id: null,
  task_type: 'repair',
  title: 'Test Task',
  description: null,
  priority: 'medium',
  status: 'pending',
  received_date: '2024-01-01',
  due_date: '2024-01-15',
  personal_due_date: null,
  scheduled_date: null,
  completed_date: null,
  estimated_hours: null,
  actual_hours: null,
  cost: null,
  notes: null,
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
  ...overrides,
});

describe('TaskRowCollapsed', () => {
  const mockTask = makeTask();
  const mockOnTaskClick = jest.fn();
  const mockOnTaskUpdate = jest.fn().mockResolvedValue(null);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render task title', () => {
    render(
      <TaskRowCollapsed
        task={mockTask}
        onTaskClick={mockOnTaskClick}
        onTaskUpdate={mockOnTaskUpdate}
      />
    );

    expect(screen.getByText('Test Task')).toBeInTheDocument();
  });

  it('should call onTaskClick when row is clicked', () => {
    render(
      <TaskRowCollapsed
        task={mockTask}
        onTaskClick={mockOnTaskClick}
        onTaskUpdate={mockOnTaskUpdate}
      />
    );

    const row = screen.getByLabelText('Open task Test Task');
    fireEvent.click(row);

    expect(mockOnTaskClick).toHaveBeenCalledWith(mockTask);
  });

  it('should call onTaskClick when Enter key is pressed', async () => {
    const user = userEvent.setup();
    render(
      <TaskRowCollapsed
        task={mockTask}
        onTaskClick={mockOnTaskClick}
        onTaskUpdate={mockOnTaskUpdate}
      />
    );

    const row = screen.getByLabelText('Open task Test Task');
    await user.type(row, '{Enter}');

    expect(mockOnTaskClick).toHaveBeenCalledWith(mockTask);
  });

  it('should call onTaskClick when Space key is pressed', async () => {
    const user = userEvent.setup();
    render(
      <TaskRowCollapsed
        task={mockTask}
        onTaskClick={mockOnTaskClick}
        onTaskUpdate={mockOnTaskUpdate}
      />
    );

    const row = screen.getByLabelText('Open task Test Task');
    await user.type(row, ' ');

    expect(mockOnTaskClick).toHaveBeenCalledWith(mockTask);
  });

  it('should render instrument label when instrument is provided', () => {
    const instrument = {
      type: 'Violin',
      maker: 'Stradivarius',
      serial_number: 'STR001',
    };

    render(
      <TaskRowCollapsed
        task={mockTask}
        instrument={instrument}
        onTaskClick={mockOnTaskClick}
        onTaskUpdate={mockOnTaskUpdate}
      />
    );

    expect(screen.getByText(/Stradivarius/)).toBeInTheDocument();
    expect(screen.getByText(/STR001/)).toBeInTheDocument();
  });

  it('should render client label when client is provided', () => {
    const client = {
      firstName: 'John',
      lastName: 'Doe',
    };

    render(
      <TaskRowCollapsed
        task={mockTask}
        client={client}
        onTaskClick={mockOnTaskClick}
        onTaskUpdate={mockOnTaskUpdate}
      />
    );

    expect(screen.getByText(/John Doe/)).toBeInTheDocument();
  });

  it('should render ownership when instrument ownership is provided', () => {
    const instrument = {
      type: 'Violin',
      maker: 'Stradivarius',
      ownership: 'HC Violins',
    };

    render(
      <TaskRowCollapsed
        task={mockTask}
        instrument={instrument}
        onTaskClick={mockOnTaskClick}
        onTaskUpdate={mockOnTaskUpdate}
      />
    );

    expect(screen.getByText(/HC Violins/)).toBeInTheDocument();
  });

  it('should render workload info when hours or cost are provided', () => {
    const taskWithWorkload = makeTask({
      estimated_hours: 5,
      actual_hours: 3,
      cost: 1000,
    });

    render(
      <TaskRowCollapsed
        task={taskWithWorkload}
        onTaskClick={mockOnTaskClick}
        onTaskUpdate={mockOnTaskUpdate}
      />
    );

    // Workload info should be displayed
    const workload = screen.queryByText(/5→3h/);
    expect(workload || screen.queryByText(/\$1k/)).toBeTruthy();
  });

  it('should render status pill', () => {
    render(
      <TaskRowCollapsed
        task={mockTask}
        onTaskClick={mockOnTaskClick}
        onTaskUpdate={mockOnTaskUpdate}
      />
    );

    expect(screen.getByTestId('status-pill')).toBeInTheDocument();
  });

  it('should render priority pill', () => {
    render(
      <TaskRowCollapsed
        task={mockTask}
        onTaskClick={mockOnTaskClick}
        onTaskUpdate={mockOnTaskUpdate}
      />
    );

    expect(screen.getByTestId('priority-pill')).toBeInTheDocument();
  });

  it('should show "Completed" text when task is completed', () => {
    const completedTask = makeTask({ status: 'completed' });

    render(
      <TaskRowCollapsed
        task={completedTask}
        onTaskClick={mockOnTaskClick}
        onTaskUpdate={mockOnTaskUpdate}
      />
    );

    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('should apply completed styling when task is completed', () => {
    const completedTask = makeTask({ status: 'completed' });

    const { container } = render(
      <TaskRowCollapsed
        task={completedTask}
        onTaskClick={mockOnTaskClick}
        onTaskUpdate={mockOnTaskUpdate}
      />
    );

    const row = container.querySelector('.bg-gray-50\\/50');
    expect(row).toBeInTheDocument();
  });

  it('should render instrument icon based on type', () => {
    const instrument = {
      type: 'Violin',
      maker: 'Stradivarius',
    };

    render(
      <TaskRowCollapsed
        task={mockTask}
        instrument={instrument}
        onTaskClick={mockOnTaskClick}
        onTaskUpdate={mockOnTaskUpdate}
      />
    );

    // Icon should be rendered (emoji)
    const icon = screen
      .getByLabelText('Open task Test Task')
      .querySelector('span[aria-hidden="true"]');
    expect(icon).toBeInTheDocument();
  });

  it('should render default icon when instrument type is not recognized', () => {
    const instrument = {
      type: 'Unknown',
      maker: 'Unknown',
    };

    render(
      <TaskRowCollapsed
        task={mockTask}
        instrument={instrument}
        onTaskClick={mockOnTaskClick}
        onTaskUpdate={mockOnTaskUpdate}
      />
    );

    const icon = screen
      .getByLabelText('Open task Test Task')
      .querySelector('span[aria-hidden="true"]');
    expect(icon).toBeInTheDocument();
  });

  it('should render without instrument or client', () => {
    render(
      <TaskRowCollapsed
        task={mockTask}
        onTaskClick={mockOnTaskClick}
        onTaskUpdate={mockOnTaskUpdate}
      />
    );

    expect(screen.getByText('Test Task')).toBeInTheDocument();
  });
});
