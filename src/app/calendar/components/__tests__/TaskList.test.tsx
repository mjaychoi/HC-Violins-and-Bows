// src/app/calendar/components/__tests__/TaskList.test.tsx
import { render, screen } from '@/test-utils/render';
import userEvent from '@testing-library/user-event';
import TaskList from '../TaskList';
import { MaintenanceTask } from '@/types';

// Mock formatDate
jest.mock('@/utils/formatUtils', () => ({
  formatDate: jest.fn((date: string) => {
    return date; // Return date as-is for testing
  }),
}));

describe('TaskList', () => {
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

  const mockInstruments = new Map([
    [
      'instrument-1',
      { type: 'Violin', maker: 'Stradivarius', ownership: 'Private' },
    ],
  ]);

  const mockOnTaskClick = jest.fn();
  const mockOnTaskDelete = jest.fn();
  let confirmSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    confirmSpy = jest.spyOn(window, 'confirm').mockImplementation(() => true);
  });

  it('should render task list', () => {
    render(
      <TaskList
        tasks={mockTasks}
        instruments={mockInstruments}
        onTaskClick={mockOnTaskClick}
        onTaskDelete={mockOnTaskDelete}
      />
    );

    expect(screen.getByText('Violin Repair')).toBeInTheDocument();
  });

  it('should display empty state when no tasks', () => {
    render(
      <TaskList
        tasks={[]}
        instruments={mockInstruments}
        onTaskClick={mockOnTaskClick}
        onTaskDelete={mockOnTaskDelete}
      />
    );

    // EmptyState 기본 카피에 맞게 업데이트
    expect(screen.getByText('No tasks yet')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Create a maintenance task to start tracking your workflow.'
      )
    ).toBeInTheDocument();
  });

  it('should handle task click', async () => {
    const user = userEvent.setup();
    render(
      <TaskList
        tasks={mockTasks}
        instruments={mockInstruments}
        onTaskClick={mockOnTaskClick}
        onTaskDelete={mockOnTaskDelete}
      />
    );

    const task = screen.getByText('Violin Repair');
    await user.click(task);

    expect(mockOnTaskClick).toHaveBeenCalledWith(mockTasks[0]);
  });

  it('should handle task deletion with task object (not window.confirm)', async () => {
    const user = userEvent.setup();

    render(
      <TaskList
        tasks={mockTasks}
        instruments={mockInstruments}
        onTaskClick={mockOnTaskClick}
        onTaskDelete={mockOnTaskDelete}
      />
    );

    // Find delete button - it should be in the task card
    const deleteButton = screen.getByLabelText('Delete task');
    await user.click(deleteButton);

    // Should call onTaskDelete with the full task object, not just ID
    expect(mockOnTaskDelete).toHaveBeenCalledWith(mockTasks[0]);
    expect(mockOnTaskDelete).toHaveBeenCalledTimes(1);

    // Should NOT use window.confirm
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('should display task details', () => {
    render(
      <TaskList
        tasks={mockTasks}
        instruments={mockInstruments}
        onTaskClick={mockOnTaskClick}
        onTaskDelete={mockOnTaskDelete}
      />
    );

    expect(screen.getByText('Violin Repair')).toBeInTheDocument();
    expect(screen.getByText('Fix bridge')).toBeInTheDocument();
    expect(screen.getByText('repair')).toBeInTheDocument();
  });

  it('should display instrument information', () => {
    render(
      <TaskList
        tasks={mockTasks}
        instruments={mockInstruments}
        onTaskClick={mockOnTaskClick}
        onTaskDelete={mockOnTaskDelete}
      />
    );

    expect(screen.getByText('Violin')).toBeInTheDocument();
    expect(screen.getByText('Stradivarius')).toBeInTheDocument();
    expect(screen.getByText('Private')).toBeInTheDocument();
  });

  it('should display task dates', () => {
    render(
      <TaskList
        tasks={mockTasks}
        instruments={mockInstruments}
        onTaskClick={mockOnTaskClick}
        onTaskDelete={mockOnTaskDelete}
      />
    );

    expect(screen.getByText(/Received:/i)).toBeInTheDocument();
    expect(screen.getByText(/Due:/i)).toBeInTheDocument();
    expect(screen.getByText(/Scheduled:/i)).toBeInTheDocument();
  });

  it('should not show delete button when onTaskDelete is not provided', () => {
    render(
      <TaskList
        tasks={mockTasks}
        instruments={mockInstruments}
        onTaskClick={mockOnTaskClick}
      />
    );

    const deleteButton = screen.queryByLabelText('Delete task');
    expect(deleteButton).not.toBeInTheDocument();
  });

  it('should handle multiple tasks', () => {
    const multipleTasks: MaintenanceTask[] = [
      ...mockTasks,
      {
        id: '2',
        instrument_id: 'instrument-2',
        client_id: null,
        task_type: 'rehair',
        title: 'Bow Rehair',
        description: 'Rehair bow',
        status: 'pending',
        received_date: '2024-01-02',
        due_date: '2024-01-16',
        personal_due_date: '2024-01-11',
        scheduled_date: '2024-01-06',
        completed_date: null,
        priority: 'high',
        estimated_hours: 1,
        actual_hours: null,
        cost: 50,
        notes: 'Test notes 2',
        created_at: '2024-01-02T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
      },
    ];

    render(
      <TaskList
        tasks={multipleTasks}
        instruments={mockInstruments}
        onTaskClick={mockOnTaskClick}
        onTaskDelete={mockOnTaskDelete}
      />
    );

    expect(screen.getByText('Violin Repair')).toBeInTheDocument();
    expect(screen.getByText('Bow Rehair')).toBeInTheDocument();
  });
});
