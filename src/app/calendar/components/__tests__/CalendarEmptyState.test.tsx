import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CalendarEmptyState from '../CalendarEmptyState';

// Mock formatDateOnly
jest.mock('@/utils/formatUtils', () => ({
  formatDateOnly: jest.fn((date: string) => date),
}));

// Mock getStatusLabel
jest.mock('@/utils/calendar', () => ({
  getStatusLabel: jest.fn((status: string) => status),
}));

describe('CalendarEmptyState', () => {
  const mockOnResetFilters = jest.fn();
  const mockOnOpenNewTask = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render "No tasks yet" when hasActiveFilters is false', () => {
    render(
      <CalendarEmptyState
        hasActiveFilters={false}
        onResetFilters={mockOnResetFilters}
        onOpenNewTask={mockOnOpenNewTask}
      />
    );

    expect(screen.getByText('No tasks yet')).toBeInTheDocument();
    expect(
      screen.getByText('Get started by creating your first maintenance task.')
    ).toBeInTheDocument();
  });

  it('should render "No tasks found" when hasActiveFilters is true', () => {
    render(
      <CalendarEmptyState
        hasActiveFilters={true}
        onResetFilters={mockOnResetFilters}
        onOpenNewTask={mockOnOpenNewTask}
      />
    );

    expect(screen.getByText('No tasks found')).toBeInTheDocument();
    expect(
      screen.getByText('Try adjusting your filters or create a new task.')
    ).toBeInTheDocument();
  });

  it('should show reset filters button when hasActiveFilters is true', async () => {
    const user = userEvent.setup();
    render(
      <CalendarEmptyState
        hasActiveFilters={true}
        onResetFilters={mockOnResetFilters}
        onOpenNewTask={mockOnOpenNewTask}
      />
    );

    const resetButton = screen.getByText('Clear filters');
    expect(resetButton).toBeInTheDocument();

    await user.click(resetButton);
    expect(mockOnResetFilters).toHaveBeenCalled();
  });

  it('should not show reset filters button when hasActiveFilters is false', () => {
    render(
      <CalendarEmptyState
        hasActiveFilters={false}
        onResetFilters={mockOnResetFilters}
        onOpenNewTask={mockOnOpenNewTask}
      />
    );

    expect(screen.queryByText('Clear filters')).not.toBeInTheDocument();
  });

  it('should display filter summary when activeFilters are provided', () => {
    render(
      <CalendarEmptyState
        hasActiveFilters={true}
        onResetFilters={mockOnResetFilters}
        onOpenNewTask={mockOnOpenNewTask}
        activeFilters={{
          status: 'pending',
          owner: 'owner1',
          dateRange: { from: '2024-01-01', to: '2024-01-31' },
          searchTerm: 'test search',
        }}
      />
    );

    // Text appears in both screen reader announcement and visible area
    const statusElements = screen.getAllByText(/Status: pending/);
    expect(statusElements.length).toBeGreaterThan(0);
    const ownerElements = screen.getAllByText(/Owner: owner1/);
    expect(ownerElements.length).toBeGreaterThan(0);
    const dateElements = screen.getAllByText(/Date: 2024-01-01 - 2024-01-31/);
    expect(dateElements.length).toBeGreaterThan(0);
    const searchElements = screen.getAllByText(/Search: "test search"/);
    expect(searchElements.length).toBeGreaterThan(0);
  });

  it('should display date range with only from date', () => {
    render(
      <CalendarEmptyState
        hasActiveFilters={true}
        onResetFilters={mockOnResetFilters}
        onOpenNewTask={mockOnOpenNewTask}
        activeFilters={{
          dateRange: { from: '2024-01-01' },
        }}
      />
    );

    // Text appears in both screen reader announcement and visible area
    const fromElements = screen.getAllByText(/From: 2024-01-01/);
    expect(fromElements.length).toBeGreaterThan(0);
  });

  it('should display date range with only to date', () => {
    render(
      <CalendarEmptyState
        hasActiveFilters={true}
        onResetFilters={mockOnResetFilters}
        onOpenNewTask={mockOnOpenNewTask}
        activeFilters={{
          dateRange: { to: '2024-01-31' },
        }}
      />
    );

    // Text appears in both screen reader announcement and visible area
    const untilElements = screen.getAllByText(/Until: 2024-01-31/);
    expect(untilElements.length).toBeGreaterThan(0);
  });

  it('should not display filter summary when status is "all"', () => {
    render(
      <CalendarEmptyState
        hasActiveFilters={true}
        onResetFilters={mockOnResetFilters}
        onOpenNewTask={mockOnOpenNewTask}
        activeFilters={{
          status: 'all',
          owner: 'owner1',
        }}
      />
    );

    // Status should not appear (filtered out because it's "all")
    expect(screen.queryByText(/Status: all/)).not.toBeInTheDocument();
    // Owner should appear (it's not "all")
    const ownerElements = screen.queryAllByText(/Owner: owner1/);
    expect(ownerElements.length).toBeGreaterThan(0);
  });

  it('should not display filter summary when owner is "all"', () => {
    render(
      <CalendarEmptyState
        hasActiveFilters={true}
        onResetFilters={mockOnResetFilters}
        onOpenNewTask={mockOnOpenNewTask}
        activeFilters={{
          status: 'pending',
          owner: 'all',
        }}
      />
    );

    // Status should appear
    const statusElements = screen.queryAllByText(/Status: pending/);
    expect(statusElements.length).toBeGreaterThan(0);
    // Owner should not appear (filtered out because it's "all")
    expect(screen.queryByText(/Owner: all/)).not.toBeInTheDocument();
  });

  it('should display resultCount in screen reader announcement', () => {
    render(
      <CalendarEmptyState
        hasActiveFilters={false}
        onResetFilters={mockOnResetFilters}
        onOpenNewTask={mockOnOpenNewTask}
        resultCount={5}
      />
    );

    const announcement = screen.getByRole('status');
    expect(announcement).toHaveTextContent('5 results');
  });
});
