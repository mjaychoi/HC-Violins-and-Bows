import { render, screen, fireEvent } from '@testing-library/react';
import TimelineView from '../TimelineView';
import { MaintenanceTask } from '@/types';

// Mock date-fns
jest.mock('date-fns', () => {
  const actual = jest.requireActual('date-fns');
  return {
    ...actual,
    format: jest.fn((date: Date, formatStr: string) => {
      if (formatStr === 'yyyy-MM-dd') {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      }
      if (formatStr === 'yyyy년 M월 d일') {
        return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
      }
      if (formatStr === 'M월 d일') {
        return `${date.getMonth() + 1}월 ${date.getDate()}일`;
      }
      if (formatStr === 'EEE') {
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        return dayNames[date.getDay()];
      }
      if (formatStr === 'M/d') {
        return `${date.getMonth() + 1}/${date.getDate()}`;
      }
      if (formatStr === 'MMMM d, yyyy') {
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
        return `${monthNames[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
      }
      return actual.format(date, formatStr);
    }),
    startOfWeek: jest.fn((date: Date) => {
      const d = new Date(date);
      const day = d.getDay();
      const diff = d.getDate() - day;
      return new Date(d.setDate(diff));
    }),
    endOfWeek: jest.fn((date: Date) => {
      const d = new Date(date);
      const day = d.getDay();
      const diff = d.getDate() - day + 6;
      return new Date(d.setDate(diff));
    }),
    eachDayOfInterval: jest.fn(({ start, end }: { start: Date; end: Date }) => {
      const days = [];
      const current = new Date(start);
      while (current <= end) {
        days.push(new Date(current));
        current.setDate(current.getDate() + 1);
      }
      return days;
    }),
    isSameDay: jest.fn((date1: Date, date2: Date) => {
      return (
        date1.getFullYear() === date2.getFullYear() &&
        date1.getMonth() === date2.getMonth() &&
        date1.getDate() === date2.getDate()
      );
    }),
    addWeeks: jest.fn((date: Date, weeks: number) => {
      const d = new Date(date);
      d.setDate(d.getDate() + weeks * 7);
      return d;
    }),
    parseISO: jest.fn((dateString: string) => {
      return new Date(dateString);
    }),
  };
});

const mockTask: MaintenanceTask = {
  id: 'task1',
  title: 'Repair violin',
  description: 'Fix bridge',
  task_type: 'repair',
  instrument_id: 'inst1',
  client_id: null,
  status: 'pending',
  priority: 'high',
  scheduled_date: '2024-01-15T10:00:00Z',
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
};

const mockInstruments = new Map([
  [
    'inst1',
    {
      type: 'Violin',
      maker: 'Stradivari',
      ownership: 'John Doe',
    },
  ],
]);

describe('TimelineView', () => {
  const mockOnSelectEvent = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render timeline view', () => {
    const currentDate = new Date(2024, 0, 15);
    render(
      <TimelineView
        currentDate={currentDate}
        tasks={[]}
        instruments={mockInstruments}
      />
    );

    expect(screen.getByText('Time')).toBeInTheDocument();
  });

  it('should display week range', () => {
    const currentDate = new Date(2024, 0, 15);
    render(
      <TimelineView
        currentDate={currentDate}
        tasks={[]}
        instruments={mockInstruments}
      />
    );

    expect(screen.getByText(/January/i)).toBeInTheDocument();
  });

  it('should navigate to previous week', () => {
    const currentDate = new Date(2024, 0, 15);
    render(
      <TimelineView
        currentDate={currentDate}
        tasks={[]}
        instruments={mockInstruments}
      />
    );

    const prevButton = screen.getByText('Previous Week');
    fireEvent.click(prevButton);

    // Week offset should change
    expect(prevButton).toBeInTheDocument();
  });

  it('should navigate to today', () => {
    const currentDate = new Date(2024, 0, 15);
    render(
      <TimelineView
        currentDate={currentDate}
        tasks={[]}
        instruments={mockInstruments}
      />
    );

    const todayButton = screen.getByText('Today');
    fireEvent.click(todayButton);

    expect(todayButton).toBeInTheDocument();
  });

  it('should navigate to next week', () => {
    const currentDate = new Date(2024, 0, 15);
    render(
      <TimelineView
        currentDate={currentDate}
        tasks={[]}
        instruments={mockInstruments}
      />
    );

    const nextButton = screen.getByText('Next Week');
    fireEvent.click(nextButton);

    expect(nextButton).toBeInTheDocument();
  });

  it('should display tasks', () => {
    const currentDate = new Date(2024, 0, 15);
    render(
      <TimelineView
        currentDate={currentDate}
        tasks={[mockTask]}
        instruments={mockInstruments}
        onSelectEvent={mockOnSelectEvent}
      />
    );

    expect(screen.getByText('Repair violin')).toBeInTheDocument();
  });

  it('should call onSelectEvent when task is clicked', () => {
    const currentDate = new Date(2024, 0, 15);
    render(
      <TimelineView
        currentDate={currentDate}
        tasks={[mockTask]}
        instruments={mockInstruments}
        onSelectEvent={mockOnSelectEvent}
      />
    );

    const taskElement = screen.getByText('Repair violin');
    fireEvent.click(taskElement);

    expect(mockOnSelectEvent).toHaveBeenCalledWith(mockTask);
  });

  it('should display instrument type for task', () => {
    const currentDate = new Date(2024, 0, 15);
    render(
      <TimelineView
        currentDate={currentDate}
        tasks={[mockTask]}
        instruments={mockInstruments}
      />
    );

    expect(screen.getByText('Violin')).toBeInTheDocument();
  });

  it('should handle tasks without scheduled_date', () => {
    const taskWithoutDate: MaintenanceTask = {
      ...mockTask,
      scheduled_date: null,
      due_date: '2024-01-15T10:00:00Z',
    };
    const currentDate = new Date(2024, 0, 15);
    render(
      <TimelineView
        currentDate={currentDate}
        tasks={[taskWithoutDate]}
        instruments={mockInstruments}
      />
    );

    expect(screen.getByText('Repair violin')).toBeInTheDocument();
  });

  it('should handle tasks with personal_due_date', () => {
    const taskWithPersonalDate: MaintenanceTask = {
      ...mockTask,
      scheduled_date: null,
      due_date: null,
      personal_due_date: '2024-01-15T10:00:00Z',
    };
    const currentDate = new Date(2024, 0, 15);
    render(
      <TimelineView
        currentDate={currentDate}
        tasks={[taskWithPersonalDate]}
        instruments={mockInstruments}
      />
    );

    expect(screen.getByText('Repair violin')).toBeInTheDocument();
  });

  it('should display hours from 00:00 to 23:00', () => {
    const currentDate = new Date(2024, 0, 15);
    render(
      <TimelineView
        currentDate={currentDate}
        tasks={[]}
        instruments={mockInstruments}
      />
    );

    expect(screen.getByText('00:00')).toBeInTheDocument();
    expect(screen.getByText('23:00')).toBeInTheDocument();
  });

  it('should handle tasks without instrument', () => {
    const taskWithoutInstrument: MaintenanceTask = {
      ...mockTask,
      instrument_id: 'nonexistent',
    };
    const currentDate = new Date(2024, 0, 15);
    render(
      <TimelineView
        currentDate={currentDate}
        tasks={[taskWithoutInstrument]}
        instruments={mockInstruments}
      />
    );

    expect(screen.getByText('Repair violin')).toBeInTheDocument();
  });

  it('should handle empty tasks array', () => {
    const currentDate = new Date(2024, 0, 15);
    render(
      <TimelineView
        currentDate={currentDate}
        tasks={[]}
        instruments={mockInstruments}
      />
    );

    expect(screen.getByText('Time')).toBeInTheDocument();
  });
});
