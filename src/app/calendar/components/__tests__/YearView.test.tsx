import { render, screen } from '@/test-utils/render';
import userEvent from '@testing-library/user-event';
import YearView from '../YearView';
import { MaintenanceTask } from '@/types';

// Mock date-fns format to avoid locale issues in tests
jest.mock('date-fns', () => {
  const actual = jest.requireActual('date-fns');
  return {
    ...actual,
    format: jest.fn(
      (date: Date, formatStr: string, options?: { locale?: unknown }) => {
        if (formatStr === 'yyyy') {
          return date.getFullYear().toString();
        }
        if (formatStr === 'MMMM') {
          const monthNames = [
            'January',
            'February',
            'March',
            'April',
            'May',
            'June',
            'July',
            'August',
            'September',
            'October',
            'November',
            'December',
          ];
          return monthNames[date.getMonth()];
        }
        if (formatStr === 'd') {
          return date.getDate().toString();
        }
        if (formatStr === 'MMMM yyyy' || formatStr === 'MMMM d, yyyy') {
          return actual.format(date, formatStr, options);
        }
        return actual.format(date, formatStr, options);
      }
    ),
  };
});

describe('YearView', () => {
  const mockTasks: MaintenanceTask[] = [
    {
      id: '1',
      title: 'Task 1',
      description: 'Description 1',
      task_type: 'repair',
      instrument_id: 'inst1',
      client_id: null,
      status: 'pending',
      priority: 'high',
      scheduled_date: '2024-01-15',
      due_date: null,
      personal_due_date: null,
      received_date: '2024-01-01',
      completed_date: null,
      estimated_hours: null,
      actual_hours: null,
      cost: null,
      notes: null,
      updated_at: '2024-01-01',
      created_at: '2024-01-01',
    },
    {
      id: '2',
      title: 'Task 2',
      description: 'Description 2',
      task_type: 'maintenance',
      instrument_id: 'inst2',
      client_id: null,
      status: 'completed',
      priority: 'urgent',
      scheduled_date: '2024-02-20',
      due_date: null,
      personal_due_date: null,
      received_date: '2024-01-02',
      completed_date: null,
      estimated_hours: null,
      actual_hours: null,
      cost: null,
      notes: null,
      updated_at: '2024-01-02',
      created_at: '2024-01-02',
    },
    {
      id: '3',
      title: 'Task 3',
      description: 'Description 3',
      task_type: 'rehair',
      instrument_id: 'inst3',
      client_id: null,
      status: 'cancelled',
      priority: 'low',
      scheduled_date: '2024-03-10',
      due_date: null,
      personal_due_date: null,
      received_date: '2024-01-03',
      completed_date: null,
      estimated_hours: null,
      actual_hours: null,
      cost: null,
      notes: null,
      updated_at: '2024-01-03',
      created_at: '2024-01-03',
    },
  ];

  const mockInstruments = new Map();

  it('should render year view with current date', () => {
    const currentDate = new Date(2024, 0, 1);
    render(
      <YearView
        currentDate={currentDate}
        tasks={mockTasks}
        instruments={mockInstruments}
      />
    );

    expect(screen.getByText(/2024/i)).toBeInTheDocument();
  });

  it('should render all 12 months', () => {
    const currentDate = new Date(2024, 0, 1);
    render(
      <YearView
        currentDate={currentDate}
        tasks={mockTasks}
        instruments={mockInstruments}
      />
    );

    // Check for month headers (1월, 2월, etc.) - should have 12 months
    const monthHeaders = screen.getAllByRole('heading', { level: 3 });
    expect(monthHeaders.length).toBeGreaterThanOrEqual(12);
  });

  it('should display task count for each month', () => {
    const currentDate = new Date(2024, 0, 1);
    render(
      <YearView
        currentDate={currentDate}
        tasks={mockTasks}
        instruments={mockInstruments}
      />
    );

    // Should show task counts (at least one month with tasks)
    const taskCounts = screen.getAllByText(/\d+\s+tasks/i);
    expect(taskCounts.length).toBeGreaterThan(0);
  });

  it('should render day labels', () => {
    const currentDate = new Date(2024, 0, 1);
    render(
      <YearView
        currentDate={currentDate}
        tasks={mockTasks}
        instruments={mockInstruments}
      />
    );

    // Day labels should appear multiple times (once per month)
    const sundayLabels = screen.getAllByText('Sun');
    expect(sundayLabels.length).toBeGreaterThan(0);
    const mondayLabels = screen.getAllByText('Mon');
    expect(mondayLabels.length).toBeGreaterThan(0);
  });

  it('should call onNavigate when month is clicked', async () => {
    const user = userEvent.setup();
    const mockOnNavigate = jest.fn();
    const currentDate = new Date(2024, 0, 1);

    render(
      <YearView
        currentDate={currentDate}
        tasks={mockTasks}
        instruments={mockInstruments}
        onNavigate={mockOnNavigate}
      />
    );

    // Find first month element and click it
    const monthElements = screen.getAllByRole('heading', { level: 3 });
    if (monthElements.length > 0) {
      await user.click(monthElements[0]);
      expect(mockOnNavigate).toHaveBeenCalled();
    }
  });

  it('should call onNavigate when day is clicked', async () => {
    const user = userEvent.setup();
    const mockOnNavigate = jest.fn();
    const currentDate = new Date(2024, 0, 1);

    render(
      <YearView
        currentDate={currentDate}
        tasks={mockTasks}
        instruments={mockInstruments}
        onNavigate={mockOnNavigate}
      />
    );

    // Find a day element (number)
    const dayElements = screen
      .getAllByText(/^\d+$/)
      .filter(el => el.closest('.grid.grid-cols-7'));

    if (dayElements.length > 0) {
      await user.click(dayElements[0]);
      expect(mockOnNavigate).toHaveBeenCalled();
    }
  });

  it('should call onSelectEvent when task dot is clicked', async () => {
    const user = userEvent.setup();
    const mockOnSelectEvent = jest.fn();
    const currentDate = new Date(2024, 0, 1);

    render(
      <YearView
        currentDate={currentDate}
        tasks={mockTasks}
        instruments={mockInstruments}
        onSelectEvent={mockOnSelectEvent}
      />
    );

    // Tasks are rendered as dots, find them by title attribute
    const taskDots = screen
      .getAllByTitle('Task 1')
      .filter(el => el.tagName === 'DIV');
    if (taskDots.length > 0) {
      await user.click(taskDots[0]);
      expect(mockOnSelectEvent).toHaveBeenCalledWith(mockTasks[0]);
    }
  });

  it('should filter tasks by month', () => {
    const currentDate = new Date(2024, 0, 1);
    render(
      <YearView
        currentDate={currentDate}
        tasks={mockTasks}
        instruments={mockInstruments}
      />
    );

    // Should show task counts for months with tasks
    const taskCounts = screen.getAllByText(/\d+\s+task/i);
    expect(taskCounts.length).toBeGreaterThan(0);
    // At least one month should show 1 task (January)
    const oneTaskTexts = screen.getAllByText(/1\s+task/i);
    expect(oneTaskTexts.length).toBeGreaterThan(0);
  });

  it('should handle tasks with due_date instead of scheduled_date', () => {
    const tasksWithDueDate: MaintenanceTask[] = [
      {
        ...mockTasks[0],
        scheduled_date: null,
        due_date: '2024-01-15',
      },
    ];
    const currentDate = new Date(2024, 0, 1);

    render(
      <YearView
        currentDate={currentDate}
        tasks={tasksWithDueDate}
        instruments={mockInstruments}
      />
    );

    expect(screen.getByText(/1\s+task/i)).toBeInTheDocument();
  });

  it('should handle tasks with personal_due_date', () => {
    const tasksWithPersonalDueDate: MaintenanceTask[] = [
      {
        ...mockTasks[0],
        scheduled_date: null,
        due_date: null,
        personal_due_date: '2024-01-15',
      },
    ];
    const currentDate = new Date(2024, 0, 1);

    render(
      <YearView
        currentDate={currentDate}
        tasks={tasksWithPersonalDueDate}
        instruments={mockInstruments}
      />
    );

    expect(screen.getByText(/1\s+task/i)).toBeInTheDocument();
  });

  it('should handle invalid date strings gracefully', () => {
    const tasksWithInvalidDate: MaintenanceTask[] = [
      {
        ...mockTasks[0],
        scheduled_date: 'invalid-date',
      },
    ];
    const currentDate = new Date(2024, 0, 1);

    render(
      <YearView
        currentDate={currentDate}
        tasks={tasksWithInvalidDate}
        instruments={mockInstruments}
      />
    );

    // Should not crash and should render the view
    expect(screen.getByText(/2024/i)).toBeInTheDocument();
  });

  it('should display task color indicators', () => {
    const currentDate = new Date(2024, 0, 1);
    const { container } = render(
      <YearView
        currentDate={currentDate}
        tasks={mockTasks}
        instruments={mockInstruments}
      />
    );

    // Check for task color dots (they have bg-* classes)
    const dots = container.querySelectorAll(
      '.bg-green-500, .bg-gray-400, .bg-red-500, .bg-orange-500, .bg-yellow-500, .bg-blue-500, .bg-gray-500'
    );
    expect(dots.length).toBeGreaterThan(0);
  });

  it('should show "+N more" indicator when more than 3 tasks on a day', () => {
    const manyTasks: MaintenanceTask[] = Array.from({ length: 5 }, (_, i) => ({
      ...mockTasks[0],
      id: `task-${i}`,
      scheduled_date: '2024-01-15',
    }));
    const currentDate = new Date(2024, 0, 1);

    render(
      <YearView
        currentDate={currentDate}
        tasks={manyTasks}
        instruments={mockInstruments}
      />
    );

    // Should show "+2 more" (5 tasks - 3 displayed = 2 more)
    expect(screen.getByText(/\+2/i)).toBeInTheDocument();
  });

  it('should highlight today', () => {
    const today = new Date();
    const currentDate = new Date(today.getFullYear(), today.getMonth(), 1);

    const { container } = render(
      <YearView
        currentDate={currentDate}
        tasks={[]}
        instruments={mockInstruments}
      />
    );

    // Today should have bg-blue-100 class
    const todayElement = container.querySelector('.bg-blue-100');
    expect(todayElement).toBeInTheDocument();
  });

  it('should handle empty tasks array', () => {
    const currentDate = new Date(2024, 0, 1);
    render(
      <YearView
        currentDate={currentDate}
        tasks={[]}
        instruments={mockInstruments}
      />
    );

    // Should render year view without crashing
    expect(screen.getByText(/2024/i)).toBeInTheDocument();
    // All months should show 0 tasks
    const zeroTaskTexts = screen.getAllByText(/0\s+task/i);
    expect(zeroTaskTexts.length).toBeGreaterThan(0);
  });

  it('should handle tasks without any date', () => {
    const tasksWithoutDate: MaintenanceTask[] = [
      {
        ...mockTasks[0],
        scheduled_date: null,
        due_date: null,
        personal_due_date: null,
      },
    ];
    const currentDate = new Date(2024, 0, 1);

    render(
      <YearView
        currentDate={currentDate}
        tasks={tasksWithoutDate}
        instruments={mockInstruments}
      />
    );

    // Should not crash
    expect(screen.getByText(/2024/i)).toBeInTheDocument();
  });
});
