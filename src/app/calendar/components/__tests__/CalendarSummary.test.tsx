import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CalendarSummary from '../CalendarSummary';

describe('CalendarSummary', () => {
  const mockOnFilterByStatus = jest.fn();
  const mockOnOpenFilters = jest.fn();

  const defaultProps = {
    total: 10,
    overdue: 2,
    today: 3,
    upcoming: 5,
    onFilterByStatus: mockOnFilterByStatus,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render all summary cards with correct values', () => {
    render(<CalendarSummary {...defaultProps} />);

    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('(10)')).toBeInTheDocument();
    expect(screen.getByText('Overdue')).toBeInTheDocument();
    expect(screen.getByText('(2)')).toBeInTheDocument();
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('(3)')).toBeInTheDocument();
    expect(screen.getByText('Next 7d')).toBeInTheDocument();
    expect(screen.getByText('(5)')).toBeInTheDocument();
  });

  it('should call onFilterByStatus with "all" when All card is clicked', async () => {
    const user = userEvent.setup();
    render(<CalendarSummary {...defaultProps} />);

    // Find the button containing "All" text
    const allButtons = screen
      .getAllByText('All')
      .map(el => el.closest('button'))
      .filter(Boolean) as HTMLButtonElement[];

    expect(allButtons.length).toBeGreaterThan(0);
    await user.click(allButtons[0]);
    expect(mockOnFilterByStatus).toHaveBeenCalledWith('all');
  });

  it('should call onFilterByStatus with "overdue" when Overdue card is clicked', async () => {
    const user = userEvent.setup();
    render(<CalendarSummary {...defaultProps} />);

    const overdueButtons = screen
      .getAllByText('Overdue')
      .map(el => el.closest('button'))
      .filter(Boolean) as HTMLButtonElement[];

    expect(overdueButtons.length).toBeGreaterThan(0);
    await user.click(overdueButtons[0]);
    expect(mockOnFilterByStatus).toHaveBeenCalledWith('overdue');
  });

  it('should call onFilterByStatus with "today" when Today card is clicked', async () => {
    const user = userEvent.setup();
    render(<CalendarSummary {...defaultProps} />);

    const todayButtons = screen
      .getAllByText('Today')
      .map(el => el.closest('button'))
      .filter(Boolean) as HTMLButtonElement[];

    expect(todayButtons.length).toBeGreaterThan(0);
    await user.click(todayButtons[0]);
    expect(mockOnFilterByStatus).toHaveBeenCalledWith('today');
  });

  it('should call onFilterByStatus with "upcoming" when Next 7d card is clicked', async () => {
    const user = userEvent.setup();
    render(<CalendarSummary {...defaultProps} />);

    const upcomingButtons = screen
      .getAllByText('Next 7d')
      .map(el => el.closest('button'))
      .filter(Boolean) as HTMLButtonElement[];

    expect(upcomingButtons.length).toBeGreaterThan(0);
    await user.click(upcomingButtons[0]);
    expect(mockOnFilterByStatus).toHaveBeenCalledWith('upcoming');
  });

  it('should highlight active preset', () => {
    render(<CalendarSummary {...defaultProps} activePreset="overdue" />);

    const overdueButton = screen.getByText('Overdue').closest('button');
    expect(overdueButton).toBeInTheDocument();
    // Check for active class (may vary based on implementation)
    expect(overdueButton?.className).toMatch(/bg-\[#FEF2F2\]|bg-red-100/);
  });

  it('should highlight all when activePreset is all', () => {
    render(<CalendarSummary {...defaultProps} activePreset="all" />);

    const allButton = screen.getByText('All').closest('button');
    expect(allButton).toBeInTheDocument();
    expect(allButton?.className).toMatch(/bg-blue-100/);
  });

  it('should highlight today when activePreset is today', () => {
    render(<CalendarSummary {...defaultProps} activePreset="today" />);

    const todayButton = screen.getByText('Today').closest('button');
    expect(todayButton).toBeInTheDocument();
    expect(todayButton?.className).toMatch(/bg-green-100/);
  });

  it('should highlight upcoming when activePreset is upcoming', () => {
    render(<CalendarSummary {...defaultProps} activePreset="upcoming" />);

    const upcomingButton = screen.getByText('Next 7d').closest('button');
    expect(upcomingButton).toBeInTheDocument();
    expect(upcomingButton?.className).toMatch(/bg-purple-100/);
  });

  it('should render filters button when onOpenFilters is provided', () => {
    render(
      <CalendarSummary {...defaultProps} onOpenFilters={mockOnOpenFilters} />
    );

    const filtersButton = screen.getByLabelText('Advanced Filters');
    expect(filtersButton).toBeInTheDocument();
  });

  it('should call onOpenFilters when filters button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <CalendarSummary {...defaultProps} onOpenFilters={mockOnOpenFilters} />
    );

    const filtersButton = screen.getByLabelText('Advanced Filters');
    await user.click(filtersButton);

    expect(mockOnOpenFilters).toHaveBeenCalledTimes(1);
  });

  it('should show active filters badge when hasActiveFilters is true', () => {
    render(
      <CalendarSummary
        {...defaultProps}
        onOpenFilters={mockOnOpenFilters}
        hasActiveFilters={true}
      />
    );

    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('should not show active filters badge when hasActiveFilters is false', () => {
    render(
      <CalendarSummary
        {...defaultProps}
        onOpenFilters={mockOnOpenFilters}
        hasActiveFilters={false}
      />
    );

    expect(screen.queryByText('Active')).not.toBeInTheDocument();
  });

  it('should set aria-expanded on filters button when filtersOpen is provided', () => {
    render(
      <CalendarSummary
        {...defaultProps}
        onOpenFilters={mockOnOpenFilters}
        filtersOpen={true}
      />
    );

    const filtersButton = screen.getByLabelText('Advanced Filters');
    expect(filtersButton).toHaveAttribute('aria-expanded', 'true');
  });

  it('should handle zero values correctly', () => {
    render(
      <CalendarSummary
        total={0}
        overdue={0}
        today={0}
        upcoming={0}
        onFilterByStatus={mockOnFilterByStatus}
      />
    );

    // Should render multiple (0) values for each card
    const zeroValues = screen.getAllByText('(0)');
    expect(zeroValues.length).toBeGreaterThanOrEqual(4);
  });

  it('should work without onFilterByStatus callback', () => {
    render(<CalendarSummary total={10} overdue={2} today={3} upcoming={5} />);

    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('Overdue')).toBeInTheDocument();
  });
});
