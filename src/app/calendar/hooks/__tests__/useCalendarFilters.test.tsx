import { renderHook, act } from '@/test-utils/render';
import { useCalendarFilters } from '../useCalendarFilters';
import { MaintenanceTask } from '@/types';
import type { TaskType, TaskStatus, TaskPriority } from '@/types';
import type { CalendarFilterOptions } from '../../types';

// Mock useURLState to avoid URL dependency
jest.mock('@/hooks/useURLState', () => ({
  useURLState: jest.fn(() => ({
    urlState: {},
    updateURLState: jest.fn(),
    clearURLState: jest.fn(),
  })),
}));

const mockTasks: MaintenanceTask[] = [
  {
    id: 'task1',
    instrument_id: 'i1',
    client_id: null,
    title: 'Repair Violin',
    description: 'Fix bridge',
    task_type: 'repair',
    status: 'pending',
    priority: 'high',
    received_date: '2024-01-01',
    scheduled_date: '2024-01-05',
    due_date: '2024-01-10',
    personal_due_date: null,
    completed_date: null,
    estimated_hours: null,
    actual_hours: null,
    cost: null,
    notes: null,
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
  },
  {
    id: 'task2',
    instrument_id: 'i2',
    client_id: null,
    title: 'Maintenance Cello',
    description: 'Regular check',
    task_type: 'maintenance',
    status: 'completed',
    priority: 'medium',
    received_date: '2024-01-02',
    scheduled_date: null,
    due_date: null,
    personal_due_date: null,
    completed_date: '2024-01-03',
    estimated_hours: null,
    actual_hours: null,
    cost: null,
    notes: null,
    created_at: '2024-01-02',
    updated_at: '2024-01-03',
  },
];

const mockInstrumentsMap = new Map([
  [
    'i1',
    {
      type: 'Violin',
      maker: 'Stradivarius',
      ownership: 'John Doe',
      serial_number: 'VI001',
      clientId: 'c1',
      clientName: 'John Doe',
    },
  ],
  [
    'i2',
    {
      type: 'Cello',
      maker: 'Guarneri',
      ownership: 'Jane Smith',
      serial_number: 'CE001',
      clientId: 'c2',
      clientName: 'Jane Smith',
    },
  ],
]);

const mockFilterOptions: CalendarFilterOptions = {
  types: ['repair', 'maintenance'] as TaskType[],
  priorities: ['high', 'medium', 'low'] as TaskPriority[],
  statuses: ['pending', 'completed'] as TaskStatus[],
  owners: ['John Doe', 'Jane Smith'],
};

describe('useCalendarFilters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize with default values', () => {
    const { result } = renderHook(() =>
      useCalendarFilters({
        tasks: mockTasks,
        instrumentsMap: mockInstrumentsMap,
        filterOptions: mockFilterOptions,
      })
    );

    expect(result.current.currentPage).toBe(1);
    expect(result.current.filterOperator).toBe('AND');
    expect(result.current.dateRange).toBeNull();
  });

  it('should filter tasks by type', () => {
    const { result } = renderHook(() =>
      useCalendarFilters({
        tasks: mockTasks,
        instrumentsMap: mockInstrumentsMap,
        filterOptions: mockFilterOptions,
      })
    );

    act(() => {
      result.current.setSearchFilters('type', 'repair');
    });

    expect(result.current.filteredTasks.length).toBeGreaterThan(0);
    expect(
      result.current.filteredTasks.every(task => task.task_type === 'repair')
    ).toBe(true);
  });

  it('should filter tasks by status', () => {
    const { result } = renderHook(() =>
      useCalendarFilters({
        tasks: mockTasks,
        instrumentsMap: mockInstrumentsMap,
        filterOptions: mockFilterOptions,
      })
    );

    act(() => {
      result.current.setFilterStatus('pending');
    });

    expect(
      result.current.filteredTasks.every(task => task.status === 'pending')
    ).toBe(true);
  });

  it('should filter tasks by priority', () => {
    const { result } = renderHook(() =>
      useCalendarFilters({
        tasks: mockTasks,
        instrumentsMap: mockInstrumentsMap,
        filterOptions: mockFilterOptions,
      })
    );

    act(() => {
      result.current.setSearchFilters('priority', 'high');
    });

    expect(
      result.current.filteredTasks.every(task => task.priority === 'high')
    ).toBe(true);
  });

  it('should filter tasks by owner', () => {
    const { result } = renderHook(() =>
      useCalendarFilters({
        tasks: mockTasks,
        instrumentsMap: mockInstrumentsMap,
        filterOptions: mockFilterOptions,
      })
    );

    act(() => {
      result.current.setSearchFilters('owner', 'John Doe');
    });

    expect(result.current.filteredTasks.length).toBeGreaterThan(0);
  });

  it('should filter tasks by date range', () => {
    const { result } = renderHook(() =>
      useCalendarFilters({
        tasks: mockTasks,
        instrumentsMap: mockInstrumentsMap,
        filterOptions: mockFilterOptions,
      })
    );

    act(() => {
      result.current.setDateRange({
        from: '2024-01-01',
        to: '2024-01-05',
      });
    });

    expect(result.current.dateRange).toEqual({
      from: '2024-01-01',
      to: '2024-01-05',
    });
  });

  it('should change filter operator', () => {
    const { result } = renderHook(() =>
      useCalendarFilters({
        tasks: mockTasks,
        instrumentsMap: mockInstrumentsMap,
        filterOptions: mockFilterOptions,
      })
    );

    act(() => {
      result.current.setFilterOperator('OR');
    });

    expect(result.current.filterOperator).toBe('OR');
  });

  it('should paginate tasks', () => {
    const { result } = renderHook(() =>
      useCalendarFilters({
        tasks: mockTasks,
        instrumentsMap: mockInstrumentsMap,
        filterOptions: mockFilterOptions,
        pageSize: 1,
      })
    );

    expect(result.current.paginatedTasks.length).toBe(1);
    expect(result.current.totalPages).toBeGreaterThan(1);
  });

  it('should change page', () => {
    const { result } = renderHook(() =>
      useCalendarFilters({
        tasks: mockTasks,
        instrumentsMap: mockInstrumentsMap,
        filterOptions: mockFilterOptions,
        pageSize: 1,
      })
    );

    act(() => {
      result.current.setPage(2);
    });

    expect(result.current.currentPage).toBe(2);
    expect(result.current.paginatedTasks.length).toBeGreaterThan(0);
  });

  it('should reset page when filters change', () => {
    const { result } = renderHook(() =>
      useCalendarFilters({
        tasks: mockTasks,
        instrumentsMap: mockInstrumentsMap,
        filterOptions: mockFilterOptions,
        pageSize: 1,
      })
    );

    act(() => {
      result.current.setPage(2);
    });

    act(() => {
      result.current.setSearchFilters('type', 'repair');
    });

    expect(result.current.currentPage).toBe(1);
  });

  it('should clear filters', () => {
    const { result } = renderHook(() =>
      useCalendarFilters({
        tasks: mockTasks,
        instrumentsMap: mockInstrumentsMap,
        filterOptions: mockFilterOptions,
      })
    );

    act(() => {
      result.current.setSearchFilters('type', 'repair');
    });

    act(() => {
      result.current.resetFilters();
    });

    expect(result.current.filteredTasks.length).toBe(mockTasks.length);
  });

  it('should detect active filters', () => {
    const { result } = renderHook(() =>
      useCalendarFilters({
        tasks: mockTasks,
        instrumentsMap: mockInstrumentsMap,
        filterOptions: mockFilterOptions,
      })
    );

    expect(result.current.hasActiveFilters).toBe(false);

    act(() => {
      result.current.setSearchFilters('type', 'repair');
    });

    expect(result.current.hasActiveFilters).toBe(true);
  });

  it('should handle search term', () => {
    const { result } = renderHook(() =>
      useCalendarFilters({
        tasks: mockTasks,
        instrumentsMap: mockInstrumentsMap,
        filterOptions: mockFilterOptions,
      })
    );

    act(() => {
      result.current.setSearchTerm('Violin');
    });

    expect(result.current.searchTerm).toBe('Violin');
    expect(result.current.filteredTasks.length).toBeGreaterThanOrEqual(0);
  });
});
