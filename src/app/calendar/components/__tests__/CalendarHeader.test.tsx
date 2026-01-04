import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CalendarHeader from '../CalendarHeader';
import type { ExtendedView } from '../CalendarView';

// Mock getViewRangeLabel
jest.mock('../../utils/viewUtils', () => ({
  getViewRangeLabel: jest.fn((view: ExtendedView) => {
    if (view === 'month') return 'January 2024';
    if (view === 'week') return 'Week of January 15, 2024';
    if (view === 'year') return '2024';
    return 'January 2024';
  }),
}));

describe('CalendarHeader', () => {
  const mockOnPrevious = jest.fn();
  const mockOnNext = jest.fn();
  const mockOnGoToToday = jest.fn();
  const mockOnViewChange = jest.fn();
  const mockOnOpenNewTask = jest.fn();

  const defaultProps = {
    currentDate: new Date('2024-01-15'),
    calendarView: 'month' as ExtendedView,
    view: 'calendar' as const,
    onPrevious: mockOnPrevious,
    onNext: mockOnNext,
    onGoToToday: mockOnGoToToday,
    onViewChange: mockOnViewChange,
    onOpenNewTask: mockOnOpenNewTask,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render header with view range label', () => {
    render(<CalendarHeader {...defaultProps} />);

    expect(screen.getByText('January 2024')).toBeInTheDocument();
  });

  it('should call onPrevious when previous button is clicked', async () => {
    const user = userEvent.setup();
    render(<CalendarHeader {...defaultProps} />);

    const prevButton = screen.getByLabelText('Previous');
    await user.click(prevButton);

    expect(mockOnPrevious).toHaveBeenCalledTimes(1);
  });

  it('should call onNext when next button is clicked', async () => {
    const user = userEvent.setup();
    render(<CalendarHeader {...defaultProps} />);

    const nextButton = screen.getByLabelText('Next');
    await user.click(nextButton);

    expect(mockOnNext).toHaveBeenCalledTimes(1);
  });

  it('should call onGoToToday when Today button is clicked', async () => {
    const user = userEvent.setup();
    render(<CalendarHeader {...defaultProps} />);

    const todayButton = screen.getByLabelText('Go to today');
    await user.click(todayButton);

    expect(mockOnGoToToday).toHaveBeenCalledTimes(1);
  });

  it('should call onViewChange with calendar when Calendar tab is clicked', async () => {
    const user = userEvent.setup();
    render(<CalendarHeader {...defaultProps} view="list" />);

    const calendarButton = screen.getByRole('tab', { name: 'Calendar view' });
    await user.click(calendarButton);

    expect(mockOnViewChange).toHaveBeenCalledWith('calendar');
  });

  it('should call onViewChange with list when List tab is clicked', async () => {
    const user = userEvent.setup();
    render(<CalendarHeader {...defaultProps} view="calendar" />);

    const listButton = screen.getByRole('tab', { name: 'List view' });
    await user.click(listButton);

    expect(mockOnViewChange).toHaveBeenCalledWith('list');
  });

  it('should show calendar view as active when view is calendar', () => {
    render(<CalendarHeader {...defaultProps} view="calendar" />);

    const calendarButton = screen.getByRole('tab', { name: 'Calendar view' });
    expect(calendarButton).toHaveAttribute('aria-selected', 'true');
  });

  it('should show list view as active when view is list', () => {
    render(<CalendarHeader {...defaultProps} view="list" />);

    const listButton = screen.getByRole('tab', { name: 'List view' });
    expect(listButton).toHaveAttribute('aria-selected', 'true');
  });

  it('should render notification badge when provided', () => {
    const notificationBadge = <div data-testid="notification-badge">Badge</div>;

    render(
      <CalendarHeader {...defaultProps} notificationBadge={notificationBadge} />
    );

    expect(screen.getByTestId('notification-badge')).toBeInTheDocument();
  });

  it('should not render notification badge when not provided', () => {
    render(<CalendarHeader {...defaultProps} />);

    expect(screen.queryByTestId('notification-badge')).not.toBeInTheDocument();
  });

  it('should render with correct structure', () => {
    const { container } = render(<CalendarHeader {...defaultProps} />);

    expect(container.querySelector('header')).toBeInTheDocument();
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('Calendar')).toBeInTheDocument();
    expect(screen.getByText('List')).toBeInTheDocument();
  });

  it('should display view range label for different calendar views', () => {
    const { rerender } = render(
      <CalendarHeader {...defaultProps} calendarView="week" />
    );

    // getViewRangeLabel is mocked to return different values
    expect(screen.getByText(/January|Week/)).toBeInTheDocument();

    rerender(<CalendarHeader {...defaultProps} calendarView="year" />);
    expect(screen.getByText(/January|2024/)).toBeInTheDocument();
  });
});
