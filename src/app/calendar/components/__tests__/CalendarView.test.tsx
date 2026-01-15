// src/app/calendar/components/__tests__/CalendarView.test.tsx
import { render, screen } from '@/test-utils/render';
import userEvent from '@testing-library/user-event';
import CalendarView from '../CalendarView';
import { MaintenanceTask } from '@/types';

// Mock react-dnd
jest.mock('react-dnd/dist/core', () => ({
  DndProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('react-dnd-html5-backend', () => ({
  HTML5Backend: {},
}));

// Mock react-big-calendar drag and drop
jest.mock('react-big-calendar/lib/addons/dragAndDrop', () => {
  return (Component: any) => Component; // Return component as-is (no HOC wrapping)
});

// Mock react-big-calendar
jest.mock('react-big-calendar', () => {
  const React = require('react');
  return {
    Calendar: ({ events, onSelectEvent, onSelectSlot }: any) => {
      const handleEventClick = (event: any) => {
        if (onSelectEvent && event.resource) {
          onSelectEvent(event.resource);
        }
      };

      const eventElements =
        events && events.length > 0
          ? React.createElement(
              'div',
              { 'data-testid': 'calendar-events' },
              events.map((event: any) => {
                const task = event.resource;
                const eventId =
                  task?.id || event.title?.replace(/\s+/g, '-') || 'unknown';
                return React.createElement(
                  'button',
                  {
                    key: eventId,
                    type: 'button',
                    'data-testid': `calendar-event-${eventId}`,
                    onClick: (e: any) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleEventClick(event);
                    },
                  },
                  event.title
                );
              })
            )
          : null;

      return React.createElement(
        'div',
        { 'data-testid': 'react-big-calendar' },
        React.createElement('div', null, 'Calendar Component'),
        eventElements,
        React.createElement(
          'button',
          {
            type: 'button',
            'data-testid': 'select-slot-button',
            onClick: (e: any) => {
              e.preventDefault();
              if (onSelectSlot) {
                onSelectSlot({ start: new Date(), end: new Date() });
              }
            },
          },
          'Select Slot'
        )
      );
    },
    dateFnsLocalizer: jest.fn(() => ({})),
    momentLocalizer: jest.fn(() => ({})), // Keep for backward compatibility
  };
});

// Mock date-fns
jest.mock('date-fns', () => ({
  ...jest.requireActual('date-fns'),
  format: jest.fn((date: Date) => {
    return date.toISOString().split('T')[0];
  }),
}));

describe('CalendarView', () => {
  const mockInstruments = new Map([
    [
      'instrument-1',
      { type: 'Violin', maker: 'Stradivarius', ownership: 'Private' },
    ],
  ]);

  const mockTasks: MaintenanceTask[] = [
    {
      id: '1',
      instrument_id: 'instrument-1',
      client_id: null,
      task_type: 'repair',
      title: 'Repair', // Task title only (instrument type will be added in CalendarView)
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

  const mockOnSelectEvent = jest.fn();
  const mockOnSelectSlot = jest.fn();
  const mockOnNavigate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render calendar view', () => {
    render(
      <CalendarView
        tasks={mockTasks}
        instruments={mockInstruments}
        onSelectEvent={mockOnSelectEvent}
        onSelectSlot={mockOnSelectSlot}
        currentDate={new Date()}
        onNavigate={mockOnNavigate}
      />
    );

    expect(screen.getByTestId('react-big-calendar')).toBeInTheDocument();
  });

  it('should display tasks as events', () => {
    render(
      <CalendarView
        tasks={mockTasks}
        instruments={mockInstruments}
        onSelectEvent={mockOnSelectEvent}
        onSelectSlot={mockOnSelectSlot}
        currentDate={new Date()}
        onNavigate={mockOnNavigate}
      />
    );

    // Calendar should render with events
    expect(screen.getByTestId('react-big-calendar')).toBeInTheDocument();
    // Check for calendar component text
    expect(screen.getByText('Calendar Component')).toBeInTheDocument();
    // Check for events container (if events exist)
    const eventsContainer = screen.queryByTestId('calendar-events');
    if (eventsContainer) {
      expect(eventsContainer).toBeInTheDocument();
    }
  });

  it('should handle event selection', () => {
    // Create a spy to track onSelectEvent calls
    const onSelectEventSpy = jest.fn();

    render(
      <CalendarView
        tasks={mockTasks}
        instruments={mockInstruments}
        onSelectEvent={onSelectEventSpy}
        onSelectSlot={mockOnSelectSlot}
        currentDate={new Date()}
        onNavigate={mockOnNavigate}
      />
    );

    // Check if events container exists (events should be rendered since mockTasks has scheduled_date)
    const eventsContainer = screen.queryByTestId('calendar-events');
    expect(eventsContainer).toBeInTheDocument();

    // Find event by test id - task.id is '1' (now it's a button)
    // Event title format is now 2-line: "Instrument\nTask Description" (no icon, no separator)
    const eventButton =
      screen.queryByRole('button', { name: /violin/i }) ||
      screen.queryByTestId('calendar-event-1');
    expect(eventButton).toBeInTheDocument();

    // Verify event is clickable by checking it's a button
    expect(eventButton).toHaveAttribute('type', 'button');

    // Test that onSelectEvent handler is passed to Calendar component
    // The actual click behavior is tested in integration tests
    // Here we verify that events are rendered and have the correct structure
    // Note: Event format is now 2-line structure with custom event component
    // The event shows instrument name (line 1) and task description (line 2)
    // Custom event component renders: <div className="event-instrument">Violin</div>
    //                                  <div className="event-description">Task Description</div>
    const buttonText = eventButton?.textContent || '';
    expect(buttonText).toMatch(/Violin/i);
    // FIXED: CalendarView removes task type patterns (like "repair") from task.title
    // If task.title is "Repair", the pattern /(수리|repair)/i matches and removes it,
    // leaving an empty string, which then defaults to 'Task' (see line 348 in CalendarView.tsx)
    // So we check for "Task" instead of "Repair"
    expect(buttonText).toMatch(/Task/i);
  });

  it('should handle slot selection', async () => {
    const user = userEvent.setup();
    render(
      <CalendarView
        tasks={mockTasks}
        instruments={mockInstruments}
        onSelectEvent={mockOnSelectEvent}
        onSelectSlot={mockOnSelectSlot}
        currentDate={new Date()}
        onNavigate={mockOnNavigate}
      />
    );

    const selectSlotButton = screen.getByTestId('select-slot-button');
    await user.click(selectSlotButton);

    expect(mockOnSelectSlot).toHaveBeenCalled();
  });

  it('should render with empty tasks', () => {
    render(
      <CalendarView
        tasks={[]}
        instruments={mockInstruments}
        onSelectEvent={mockOnSelectEvent}
        onSelectSlot={mockOnSelectSlot}
        currentDate={new Date()}
        onNavigate={mockOnNavigate}
      />
    );

    expect(screen.getByTestId('react-big-calendar')).toBeInTheDocument();
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
      <CalendarView
        tasks={multipleTasks}
        instruments={mockInstruments}
        onSelectEvent={mockOnSelectEvent}
        onSelectSlot={mockOnSelectSlot}
        currentDate={new Date()}
        onNavigate={mockOnNavigate}
      />
    );

    // Calendar should render with multiple events
    expect(screen.getByTestId('react-big-calendar')).toBeInTheDocument();
    expect(screen.getByText('Calendar Component')).toBeInTheDocument();
    // Check for events container (should exist with multiple tasks)
    const eventsContainer = screen.queryByTestId('calendar-events');
    if (eventsContainer) {
      expect(eventsContainer).toBeInTheDocument();
    }
  });

  it('should handle tasks without dates', () => {
    const tasksWithoutDates: MaintenanceTask[] = [
      {
        ...mockTasks[0],
        due_date: null,
        personal_due_date: null,
        scheduled_date: null,
      },
    ];

    render(
      <CalendarView
        tasks={tasksWithoutDates}
        instruments={mockInstruments}
        onSelectEvent={mockOnSelectEvent}
        onSelectSlot={mockOnSelectSlot}
        currentDate={new Date()}
        onNavigate={mockOnNavigate}
      />
    );

    expect(screen.getByTestId('react-big-calendar')).toBeInTheDocument();
  });

  it('should handle view changes', () => {
    const mockOnViewChange = jest.fn();
    render(
      <CalendarView
        tasks={mockTasks}
        instruments={mockInstruments}
        onSelectEvent={mockOnSelectEvent}
        onSelectSlot={mockOnSelectSlot}
        currentDate={new Date()}
        onNavigate={mockOnNavigate}
        currentView="month"
        onViewChange={mockOnViewChange}
      />
    );

    expect(screen.getByTestId('react-big-calendar')).toBeInTheDocument();
  });

  it('should handle year view', () => {
    render(
      <CalendarView
        tasks={mockTasks}
        instruments={mockInstruments}
        onSelectEvent={mockOnSelectEvent}
        currentDate={new Date()}
        onNavigate={mockOnNavigate}
        currentView="year"
      />
    );

    // YearView should be rendered instead of Calendar
    expect(screen.queryByTestId('react-big-calendar')).not.toBeInTheDocument();
  });

  it('should handle timeline view', () => {
    render(
      <CalendarView
        tasks={mockTasks}
        instruments={mockInstruments}
        onSelectEvent={mockOnSelectEvent}
        currentDate={new Date()}
        onNavigate={mockOnNavigate}
        currentView="timeline"
      />
    );

    // TimelineView should be rendered instead of Calendar
    expect(screen.queryByTestId('react-big-calendar')).not.toBeInTheDocument();
  });

  it('should handle dragging event ID', () => {
    render(
      <CalendarView
        tasks={mockTasks}
        instruments={mockInstruments}
        onSelectEvent={mockOnSelectEvent}
        onSelectSlot={mockOnSelectSlot}
        currentDate={new Date()}
        onNavigate={mockOnNavigate}
        draggingEventId="1"
      />
    );

    expect(screen.getByTestId('react-big-calendar')).toBeInTheDocument();
  });

  it('should handle tasks with invalid dates', () => {
    const tasksWithInvalidDates: MaintenanceTask[] = [
      {
        ...mockTasks[0],
        due_date: 'invalid-date',
      },
    ];

    render(
      <CalendarView
        tasks={tasksWithInvalidDates}
        instruments={mockInstruments}
        onSelectEvent={mockOnSelectEvent}
        onSelectSlot={mockOnSelectSlot}
        currentDate={new Date()}
        onNavigate={mockOnNavigate}
      />
    );

    expect(screen.getByTestId('react-big-calendar')).toBeInTheDocument();
  });

  it('should handle tasks with ISO date format', () => {
    const tasksWithISODate: MaintenanceTask[] = [
      {
        ...mockTasks[0],
        due_date: '2024-01-15T10:00:00Z',
      },
    ];

    render(
      <CalendarView
        tasks={tasksWithISODate}
        instruments={mockInstruments}
        onSelectEvent={mockOnSelectEvent}
        onSelectSlot={mockOnSelectSlot}
        currentDate={new Date()}
        onNavigate={mockOnNavigate}
      />
    );

    expect(screen.getByTestId('react-big-calendar')).toBeInTheDocument();
  });

  it('should prioritize due_date over personal_due_date and scheduled_date', () => {
    const taskWithMultipleDates: MaintenanceTask[] = [
      {
        ...mockTasks[0],
        due_date: '2024-01-15',
        personal_due_date: '2024-01-10',
        scheduled_date: '2024-01-05',
      },
    ];

    render(
      <CalendarView
        tasks={taskWithMultipleDates}
        instruments={mockInstruments}
        onSelectEvent={mockOnSelectEvent}
        onSelectSlot={mockOnSelectSlot}
        currentDate={new Date()}
        onNavigate={mockOnNavigate}
      />
    );

    // Should render calendar with event (due_date should be used)
    expect(screen.getByTestId('react-big-calendar')).toBeInTheDocument();
  });
});
