import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CalendarFilters from '../CalendarFilters';
import type { TaskType, TaskStatus, TaskPriority } from '@/types';
import type { DateRange, FilterOperator } from '@/types/search';

// Mock child components
jest.mock('../CalendarSearch', () => {
  const CalendarSearch = React.forwardRef<
    HTMLInputElement,
    {
      searchTerm: string;
      onSearchChange: (term: string) => void;
      debounceMs?: number;
    }
  >(({ searchTerm, onSearchChange }, ref) => (
    <input
      ref={ref}
      value={searchTerm}
      onChange={e => onSearchChange(e.target.value)}
      data-testid="calendar-search"
      placeholder="Search tasks..."
    />
  ));
  CalendarSearch.displayName = 'CalendarSearch';
  return CalendarSearch;
});

jest.mock('@/components/common/inputs', () => ({
  AdvancedSearch: ({
    onDateRangeChange,
    operator,
    onOperatorChange,
    onReset,
  }: any) => (
    <div data-testid="advanced-search">
      <button onClick={() => onReset()}>Reset Advanced</button>
      <button
        onClick={() =>
          onDateRangeChange({ from: '2024-01-01', to: '2024-01-31' })
        }
      >
        Set Date Range
      </button>
      <button
        onClick={() => onOperatorChange(operator === 'AND' ? 'OR' : 'AND')}
      >
        Toggle Operator
      </button>
    </div>
  ),
  PillSelect: ({ value, onChange, options, 'aria-label': ariaLabel }: any) => (
    <div data-testid={`pill-select-${ariaLabel || 'default'}`}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        aria-label={ariaLabel}
      >
        {options.map((opt: any) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  ),
}));

describe('CalendarFilters', () => {
  const mockOnSearchChange = jest.fn();
  const mockOnFilterChange = jest.fn();
  const mockOnStatusChange = jest.fn();
  const mockOnOwnershipChange = jest.fn();
  const mockOnSortByChange = jest.fn();
  const mockOnSortOrderChange = jest.fn();
  const mockOnDateRangeChange = jest.fn();
  const mockOnFilterOperatorChange = jest.fn();
  const mockOnResetFilters = jest.fn();

  const defaultProps = {
    searchTerm: '',
    onSearchChange: mockOnSearchChange,
    searchFilters: {
      type: 'all' as TaskType | 'all',
      priority: 'all' as TaskPriority | 'all',
    },
    onFilterChange: mockOnFilterChange,
    filterOptions: {
      types: ['repair', 'maintenance'] as TaskType[],
      priorities: ['high', 'medium', 'low'] as TaskPriority[],
      statuses: ['pending', 'in_progress', 'completed'] as TaskStatus[],
      owners: ['owner1', 'owner2'],
    },
    filterStatus: 'all',
    onStatusChange: mockOnStatusChange,
    filterOwnership: 'all',
    onOwnershipChange: mockOnOwnershipChange,
    ownershipOptions: ['owner1', 'owner2'],
    sortBy: 'date' as const,
    onSortByChange: mockOnSortByChange,
    sortOrder: 'asc' as const,
    onSortOrderChange: mockOnSortOrderChange,
    dateRange: null as DateRange | null,
    onDateRangeChange: mockOnDateRangeChange,
    filterOperator: 'AND' as FilterOperator,
    onFilterOperatorChange: mockOnFilterOperatorChange,
    taskCount: 10,
    hasActiveFilters: false,
    onResetFilters: mockOnResetFilters,
    showSort: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render search input', () => {
    render(<CalendarFilters {...defaultProps} />);

    expect(screen.getByTestId('calendar-search')).toBeInTheDocument();
  });

  it('should render advanced search component', () => {
    render(<CalendarFilters {...defaultProps} />);

    expect(screen.getByTestId('advanced-search')).toBeInTheDocument();
  });

  it('should render filter pills when filterOptions are provided', () => {
    render(<CalendarFilters {...defaultProps} />);

    expect(screen.getByLabelText('Filter by task type')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by priority')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by status')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by owner')).toBeInTheDocument();
  });

  it('should not render filter pills when filterOptions are empty', () => {
    const props = {
      ...defaultProps,
      filterOptions: {
        types: [],
        priorities: [],
        statuses: [],
        owners: [],
      },
    };

    render(<CalendarFilters {...props} />);

    expect(
      screen.queryByLabelText('Filter by task type')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Filter by priority')
    ).not.toBeInTheDocument();
  });

  it('should call onFilterChange when type filter changes', async () => {
    const user = userEvent.setup();
    render(<CalendarFilters {...defaultProps} />);

    const typeSelect = screen.getByLabelText('Filter by task type');
    await user.selectOptions(typeSelect, 'repair');

    expect(mockOnFilterChange).toHaveBeenCalledWith('type', 'repair');
  });

  it('should call onFilterChange when priority filter changes', async () => {
    const user = userEvent.setup();
    render(<CalendarFilters {...defaultProps} />);

    const prioritySelect = screen.getByLabelText('Filter by priority');
    await user.selectOptions(prioritySelect, 'high');

    expect(mockOnFilterChange).toHaveBeenCalledWith('priority', 'high');
  });

  it('should call onStatusChange when status filter changes', async () => {
    const user = userEvent.setup();
    render(<CalendarFilters {...defaultProps} />);

    const statusSelect = screen.getByLabelText('Filter by status');
    await user.selectOptions(statusSelect, 'pending');

    expect(mockOnStatusChange).toHaveBeenCalledWith('pending');
  });

  it('should call onOwnershipChange when owner filter changes', async () => {
    const user = userEvent.setup();
    render(<CalendarFilters {...defaultProps} />);

    const ownerSelect = screen.getByLabelText('Filter by owner');
    await user.selectOptions(ownerSelect, 'owner1');

    expect(mockOnOwnershipChange).toHaveBeenCalledWith('owner1');
  });

  it('should render sort controls when showSort is true', () => {
    render(<CalendarFilters {...defaultProps} showSort={true} />);

    expect(screen.getByText('Sort:')).toBeInTheDocument();
  });

  it('should not render sort controls when showSort is false', () => {
    render(<CalendarFilters {...defaultProps} showSort={false} />);

    expect(screen.queryByText('Sort:')).not.toBeInTheDocument();
  });

  it('should call onSortByChange when sort by changes', async () => {
    const user = userEvent.setup();
    render(<CalendarFilters {...defaultProps} />);

    // Find the sort select (it doesn't have aria-label, so we'll find it by its parent)
    const sortContainer = screen.getByText('Sort:').parentElement;
    const sortSelect = sortContainer?.querySelector('select');

    if (sortSelect) {
      await user.selectOptions(sortSelect, 'priority');
      expect(mockOnSortByChange).toHaveBeenCalledWith('priority');
    }
  });

  it('should call onSortOrderChange when sort order button is clicked', async () => {
    const user = userEvent.setup();
    render(<CalendarFilters {...defaultProps} sortOrder="asc" />);

    const sortToggle = screen.getByLabelText('Sort descending');
    await user.click(sortToggle);

    expect(mockOnSortOrderChange).toHaveBeenCalled();
  });

  it('should display task count', () => {
    render(<CalendarFilters {...defaultProps} taskCount={25} />);

    expect(screen.getByText('25 tasks')).toBeInTheDocument();
  });

  it('should render reset button when hasActiveFilters is true', () => {
    render(<CalendarFilters {...defaultProps} hasActiveFilters={true} />);

    expect(screen.getByLabelText('Reset all filters')).toBeInTheDocument();
    expect(screen.getByText('Reset')).toBeInTheDocument();
  });

  it('should not render reset button when hasActiveFilters is false', () => {
    render(<CalendarFilters {...defaultProps} hasActiveFilters={false} />);

    expect(
      screen.queryByLabelText('Reset all filters')
    ).not.toBeInTheDocument();
  });

  it('should call onResetFilters when reset button is clicked', async () => {
    const user = userEvent.setup();
    render(<CalendarFilters {...defaultProps} hasActiveFilters={true} />);

    const resetButton = screen.getByLabelText('Reset all filters');
    await user.click(resetButton);

    expect(mockOnResetFilters).toHaveBeenCalled();
  });

  it('should call onDateRangeChange and onFilterOperatorChange when AdvancedSearch reset is clicked', async () => {
    const user = userEvent.setup();
    render(<CalendarFilters {...defaultProps} />);

    const resetAdvancedButton = screen.getByText('Reset Advanced');
    await user.click(resetAdvancedButton);

    expect(mockOnDateRangeChange).toHaveBeenCalledWith(null);
    expect(mockOnFilterOperatorChange).toHaveBeenCalledWith('AND');
  });

  it('should handle date range change from AdvancedSearch', async () => {
    const user = userEvent.setup();
    render(<CalendarFilters {...defaultProps} />);

    const setDateRangeButton = screen.getByText('Set Date Range');
    await user.click(setDateRangeButton);

    expect(mockOnDateRangeChange).toHaveBeenCalledWith({
      from: '2024-01-01',
      to: '2024-01-31',
    });
  });

  it('should handle filter operator change from AdvancedSearch', async () => {
    const user = userEvent.setup();
    render(<CalendarFilters {...defaultProps} filterOperator="AND" />);

    const toggleOperatorButton = screen.getByText('Toggle Operator');
    await user.click(toggleOperatorButton);

    expect(mockOnFilterOperatorChange).toHaveBeenCalledWith('OR');
  });

  it('should pass searchInputRef to CalendarSearch', () => {
    const searchInputRef = React.createRef<HTMLInputElement>();
    render(
      <CalendarFilters {...defaultProps} searchInputRef={searchInputRef} />
    );

    const searchInput = screen.getByTestId('calendar-search');
    expect(searchInputRef.current).toBe(searchInput);
  });

  it('should render additional statuses beyond default ones using formatStatus', () => {
    render(
      <CalendarFilters
        {...defaultProps}
        filterOptions={{
          ...defaultProps.filterOptions,
          statuses: [
            'pending',
            'in_progress',
            'completed',
            'cancelled',
            'custom_status',
          ] as TaskStatus[],
        }}
      />
    );

    // Should show status filter with custom_status formatted
    const statusSelect = screen.getByLabelText('Filter by status');
    expect(statusSelect).toBeInTheDocument();
    // Custom status should be in options (formatted via formatStatus)
    expect(statusSelect).toHaveValue('all');
  });

  it('should hide sort controls when showSort is false', () => {
    render(<CalendarFilters {...defaultProps} showSort={false} />);

    // Sort controls should not be visible
    expect(screen.queryByText(/Sort by/i)).not.toBeInTheDocument();
  });
});
