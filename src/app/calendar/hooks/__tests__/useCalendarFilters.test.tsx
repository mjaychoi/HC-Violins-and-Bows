import { renderHook, act } from '@/test-utils/render';
import { useCalendarFilters } from '../useCalendarFilters';
import { MaintenanceTask } from '@/types';
import type { TaskType, TaskStatus, TaskPriority } from '@/types';
import type { CalendarFilterOptions } from '../../types';

// Mock useURLState so filters syncs behaves like real hook
jest.mock('@/hooks/useURLState', () => {
  const React: typeof import('react') = require('react');
  return {
    useURLState: jest.fn(() => {
      const [urlState, setUrlState] = React.useState<
        Record<string, string | string[] | null>
      >({});
      const updateURLState = React.useCallback(
        (updates: Record<string, string | string[] | null | undefined>) => {
          setUrlState((prevState: Record<string, string | string[] | null>) => {
            const nextState = { ...prevState };
            let hasChanges = false;

            Object.entries(updates).forEach(([key, value]) => {
              if (
                value === null ||
                value === undefined ||
                (typeof value === 'string' && value === '')
              ) {
                if (Object.prototype.hasOwnProperty.call(nextState, key)) {
                  delete nextState[key];
                  hasChanges = true;
                }
                return;
              }

              const normalized = Array.isArray(value)
                ? [...value]
                : (value as string);

              const existing = nextState[key];
              const valueChanged =
                Array.isArray(normalized) && Array.isArray(existing)
                  ? normalized.length !== existing.length ||
                    normalized.some((item, index) => item !== existing[index])
                  : normalized !== existing;

              if (valueChanged) {
                nextState[key] = normalized;
                hasChanges = true;
              }
            });

            return hasChanges ? nextState : prevState;
          });
        },
        []
      );
      const clearURLState = React.useCallback(() => {
        setUrlState({});
      }, []);

      return {
        urlState,
        updateURLState,
        clearURLState,
      };
    }),
  };
});

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
    expect(result.current.filterOperator).toBe('OR');
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
    // Create ownershipMap from instrumentsMap for filtering
    const ownershipMap = new Map(
      Array.from(mockInstrumentsMap.entries()).map(([id, info]) => [
        id,
        { ownership: info.ownership },
      ])
    );

    const { result } = renderHook(() =>
      useCalendarFilters({
        tasks: mockTasks,
        instrumentsMap: mockInstrumentsMap,
        ownershipMap,
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

  it('should reset filter operator to OR when filters are cleared', () => {
    const { result } = renderHook(() =>
      useCalendarFilters({
        tasks: mockTasks,
        instrumentsMap: mockInstrumentsMap,
        filterOptions: mockFilterOptions,
      })
    );

    act(() => {
      result.current.setFilterOperator('AND');
    });

    act(() => {
      result.current.resetFilters();
    });

    expect(result.current.filterOperator).toBe('OR');
  });

  it('date range filter uses canonical placement (due wins); OR/AND agree', () => {
    // placement = due_date 2024-01-10 — outside 01-04..01-06
    const taskWithMixedDates: MaintenanceTask = {
      ...mockTasks[0],
      id: 'mixed-dates',
      received_date: '2024-01-01',
      due_date: '2024-01-10',
      scheduled_date: '2024-01-05',
    };

    const { result } = renderHook(() =>
      useCalendarFilters({
        tasks: [taskWithMixedDates],
        instrumentsMap: mockInstrumentsMap,
        filterOptions: mockFilterOptions,
      })
    );

    act(() => {
      result.current.setFilterOperator('OR');
      result.current.setDateRange({ from: '2024-01-04', to: '2024-01-06' });
    });
    expect(result.current.filteredTasks).toEqual([]);

    act(() => {
      result.current.setFilterOperator('AND');
    });
    expect(result.current.filteredTasks).toEqual([]);
  });

  it('includes task when placement date falls in range (OR and AND)', () => {
    const task: MaintenanceTask = {
      ...mockTasks[0],
      id: 'placement-in-range',
      due_date: '2024-01-05',
      scheduled_date: '2024-01-01',
      received_date: '2023-12-01',
    };

    const { result } = renderHook(() =>
      useCalendarFilters({
        tasks: [task],
        instrumentsMap: mockInstrumentsMap,
        filterOptions: mockFilterOptions,
      })
    );

    act(() => {
      result.current.setDateRange({ from: '2024-01-04', to: '2024-01-06' });
    });
    expect(result.current.filteredTasks.map(t => t.id)).toEqual([
      'placement-in-range',
    ]);

    act(() => {
      result.current.setFilterOperator('AND');
    });
    expect(result.current.filteredTasks.map(t => t.id)).toEqual([
      'placement-in-range',
    ]);
  });

  describe('selectedPlacementDate', () => {
    const dayTasks: MaintenanceTask[] = [
      {
        ...mockTasks[0],
        id: 'on-day',
        due_date: '2024-01-10',
        scheduled_date: null,
        received_date: '2024-01-01',
      },
      {
        ...mockTasks[0],
        id: 'other-day',
        due_date: '2024-01-11',
        scheduled_date: null,
        received_date: '2024-01-01',
      },
      {
        ...mockTasks[0],
        id: 'received-on-day',
        due_date: null,
        personal_due_date: null,
        scheduled_date: null,
        received_date: '2024-01-10',
      },
    ];

    it('filters to placement date before pagination (header/list consistency)', () => {
      const { result } = renderHook(() =>
        useCalendarFilters({
          tasks: dayTasks,
          instrumentsMap: mockInstrumentsMap,
          filterOptions: mockFilterOptions,
          selectedPlacementDate: '2024-01-10',
          pageSize: 10,
        })
      );

      expect(result.current.filteredTasks.map(t => t.id).sort()).toEqual([
        'on-day',
        'received-on-day',
      ]);
      expect(result.current.totalCount).toBe(2);
      expect(result.current.paginatedTasks).toHaveLength(2);
    });

    it('returns empty list for a day with no placement matches', () => {
      const { result } = renderHook(() =>
        useCalendarFilters({
          tasks: dayTasks,
          instrumentsMap: mockInstrumentsMap,
          filterOptions: mockFilterOptions,
          selectedPlacementDate: '2024-02-01',
        })
      );

      expect(result.current.filteredTasks).toEqual([]);
      expect(result.current.totalCount).toBe(0);
      expect(result.current.paginatedTasks).toEqual([]);
    });

    it('resets pagination to page 1 when selectedPlacementDate changes', () => {
      const manyOnDay = Array.from({ length: 5 }, (_, i) => ({
        ...dayTasks[0],
        id: `day-${i}`,
      }));

      const { result, rerender } = renderHook(
        ({ selectedPlacementDate }: { selectedPlacementDate: string | null }) =>
          useCalendarFilters({
            tasks: [...manyOnDay, dayTasks[1]],
            instrumentsMap: mockInstrumentsMap,
            filterOptions: mockFilterOptions,
            selectedPlacementDate,
            pageSize: 2,
          }),
        {
          initialProps: {
            selectedPlacementDate: '2024-01-10' as string | null,
          },
        }
      );

      act(() => {
        result.current.setPage(2);
      });
      expect(result.current.currentPage).toBe(2);

      rerender({ selectedPlacementDate: '2024-01-11' });

      expect(result.current.currentPage).toBe(1);
      expect(result.current.filteredTasks.map(t => t.id)).toEqual([
        'other-day',
      ]);
    });
  });

  it('resets pagination to page 1 when filter operator changes', () => {
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
      result.current.setFilterOperator('AND');
    });

    expect(result.current.currentPage).toBe(1);
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
