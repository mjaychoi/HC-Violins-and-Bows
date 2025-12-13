import { highlightText, searchTasks, sortTasks } from '../searchUtils';
import { MaintenanceTask } from '@/types';

describe('searchUtils', () => {
  describe('highlightText', () => {
    it('should return original text when search term is empty', () => {
      const result = highlightText('Hello World', '');
      expect(result).toBe('Hello World');
    });

    it('should return original text when text is empty', () => {
      const result = highlightText('', 'search');
      expect(result).toBe('');
    });

    it('should highlight matching text', () => {
      const result = highlightText('Hello World', 'Hello');
      expect(result).not.toBe('Hello World');
      expect(result).toBeDefined();
    });

    it('should handle case-insensitive matching', () => {
      const result = highlightText('Hello World', 'hello');
      expect(result).not.toBe('Hello World');
      expect(result).toBeDefined();
    });

    it('should escape special regex characters', () => {
      const result = highlightText('Test (value)', '(value)');
      expect(result).not.toBe('Test (value)');
      expect(result).toBeDefined();
    });

    it('should handle multiple matches', () => {
      const result = highlightText('Hello Hello World', 'Hello');
      expect(result).not.toBe('Hello Hello World');
      expect(result).toBeDefined();
    });

    it('should handle no matches', () => {
      const result = highlightText('Hello World', 'NotFound');
      expect(Array.isArray(result)).toBe(true);
      expect(result).toEqual(['Hello World']);
    });
  });

  describe('searchTasks', () => {
    const mockInstrumentsMap = new Map([
      [
        'inst1',
        {
          type: 'Violin',
          maker: 'Stradivari',
          ownership: 'John Doe',
          serial_number: 'VI0000001',
        },
      ],
      [
        'inst2',
        {
          type: 'Cello',
          maker: 'Guarneri',
          ownership: 'Jane Smith',
          serial_number: 'CE0000001',
        },
      ],
      [
        'inst3',
        {
          type: 'Viola',
          maker: 'Amati',
          ownership: 'Bob Wilson',
          serial_number: 'VA0000001',
        },
      ],
    ]);

    const mockTasks: MaintenanceTask[] = [
      {
        id: '1',
        title: 'Repair violin',
        description: 'Fix bridge',
        task_type: 'repair',
        instrument_id: 'inst1',
        client_id: null,
        status: 'pending',
        priority: 'high',
        scheduled_date: '2024-01-01',
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
        title: 'Restring cello',
        description: 'Replace strings',
        task_type: 'rehair',
        instrument_id: 'inst2',
        client_id: null,
        status: 'pending',
        priority: 'medium',
        scheduled_date: '2024-01-02',
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
        title: 'General maintenance',
        description: 'Clean and polish',
        task_type: 'maintenance',
        instrument_id: 'inst3',
        client_id: null,
        status: 'completed',
        priority: 'low',
        scheduled_date: null,
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

    it('should return all tasks when search term is empty', () => {
      const result = searchTasks(mockTasks, '', mockInstrumentsMap);
      expect(result).toEqual(mockTasks);
    });

    it('should return all tasks when search term is only whitespace', () => {
      const result = searchTasks(mockTasks, '   ', mockInstrumentsMap);
      expect(result).toEqual(mockTasks);
    });

    it('should search by instrument maker', () => {
      const result = searchTasks(mockTasks, 'Stradivari', mockInstrumentsMap);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('should search by instrument type', () => {
      const result = searchTasks(mockTasks, 'Violin', mockInstrumentsMap);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('should search by instrument ownership', () => {
      const result = searchTasks(mockTasks, 'John Doe', mockInstrumentsMap);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('should search by serial number', () => {
      const result = searchTasks(mockTasks, 'VI0000001', mockInstrumentsMap);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('should search by task title', () => {
      const result = searchTasks(mockTasks, 'Repair', mockInstrumentsMap);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('should search by task description', () => {
      const result = searchTasks(mockTasks, 'Fix bridge', mockInstrumentsMap);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('should search by task type', () => {
      const result = searchTasks(mockTasks, 'repair', mockInstrumentsMap);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('should handle tasks without instrument', () => {
      const result = searchTasks(mockTasks, 'maintenance', mockInstrumentsMap);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('3');
    });

    it('should support multiple search terms (AND logic)', () => {
      const result = searchTasks(mockTasks, 'Violin Stradivari', mockInstrumentsMap);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('should return empty array when no matches', () => {
      const result = searchTasks(mockTasks, 'NotFound', mockInstrumentsMap);
      expect(result).toHaveLength(0);
    });

    it('should be case-insensitive', () => {
      const result = searchTasks(mockTasks, 'violin', mockInstrumentsMap);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('should handle tasks with missing instrument in map', () => {
      const taskWithoutInstrument: MaintenanceTask = {
        id: '4',
        title: 'Test task',
        description: 'Test description',
        task_type: 'inspection',
        instrument_id: 'nonexistent',
        client_id: null,
        status: 'pending',
        priority: 'low',
        scheduled_date: null,
        due_date: null,
        personal_due_date: null,
        received_date: '2024-01-04',
        completed_date: null,
        estimated_hours: null,
        actual_hours: null,
        cost: null,
        notes: null,
        updated_at: '2024-01-04',
        created_at: '2024-01-04',
      };
      const tasks = [...mockTasks, taskWithoutInstrument];
      const result = searchTasks(tasks, 'Test', mockInstrumentsMap);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('4');
    });
  });

  describe('sortTasks', () => {
    const mockTasks: MaintenanceTask[] = [
      {
        id: '1',
        title: 'Task 1',
        description: 'Description 1',
        task_type: 'repair',
        instrument_id: 'inst1',
        client_id: null,
        status: 'pending',
        priority: 'low',
        scheduled_date: '2024-01-03',
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
        scheduled_date: '2024-01-01',
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
        status: 'in_progress',
        priority: 'high',
        scheduled_date: '2024-01-02',
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

    it('should sort by date ascending', () => {
      const result = sortTasks(mockTasks, 'date', 'asc');
      expect(result[0].id).toBe('2');
      expect(result[1].id).toBe('3');
      expect(result[2].id).toBe('1');
    });

    it('should sort by date descending', () => {
      const result = sortTasks(mockTasks, 'date', 'desc');
      expect(result[0].id).toBe('1');
      expect(result[1].id).toBe('3');
      expect(result[2].id).toBe('2');
    });

    it('should sort by priority descending (lower first due to comparison logic)', () => {
      const result = sortTasks(mockTasks, 'priority', 'desc');
      // comparison = bPriority - aPriority, desc = -comparison = aPriority - bPriority
      // So desc means lower priority first
      expect(result[0].priority).toBe('low');
      expect(result[1].priority).toBe('high');
      expect(result[2].priority).toBe('urgent');
    });

    it('should sort by priority ascending (higher first due to comparison logic)', () => {
      const result = sortTasks(mockTasks, 'priority', 'asc');
      // comparison = bPriority - aPriority, asc = comparison
      // So asc means higher priority first
      expect(result[0].priority).toBe('urgent');
      expect(result[1].priority).toBe('high');
      expect(result[2].priority).toBe('low');
    });

    it('should sort by status', () => {
      const result = sortTasks(mockTasks, 'status', 'asc');
      expect(result[0].status).toBe('pending');
      expect(result[1].status).toBe('in_progress');
      expect(result[2].status).toBe('completed');
    });

    it('should sort by type', () => {
      const result = sortTasks(mockTasks, 'type', 'asc');
      // Alphabetical order: maintenance < rehair < repair
      expect(result[0].task_type).toBe('maintenance');
      expect(result[1].task_type).toBe('rehair');
      expect(result[2].task_type).toBe('repair');
    });

    it('should use due_date when scheduled_date is not available', () => {
      const tasksWithDueDate: MaintenanceTask[] = [
        {
          ...mockTasks[0],
          scheduled_date: null,
          due_date: '2024-01-05',
        },
        {
          ...mockTasks[1],
          scheduled_date: '2024-01-01',
        },
      ];
      const result = sortTasks(tasksWithDueDate, 'date', 'asc');
      expect(result[0].id).toBe('2');
      expect(result[1].id).toBe('1');
    });

    it('should use personal_due_date when other dates are not available', () => {
      const tasksWithPersonalDueDate: MaintenanceTask[] = [
        {
          ...mockTasks[0],
          scheduled_date: null,
          due_date: null,
          personal_due_date: '2024-01-06',
        },
        {
          ...mockTasks[1],
          scheduled_date: '2024-01-01',
        },
      ];
      const result = sortTasks(tasksWithPersonalDueDate, 'date', 'asc');
      expect(result[0].id).toBe('2');
      expect(result[1].id).toBe('1');
    });

    it('should use received_date when other dates are not available', () => {
      const tasksWithReceivedDate: MaintenanceTask[] = [
        {
          ...mockTasks[0],
          scheduled_date: null,
          due_date: null,
          personal_due_date: null,
          received_date: '2024-01-07',
        },
        {
          ...mockTasks[1],
          scheduled_date: '2024-01-01',
        },
      ];
      const result = sortTasks(tasksWithReceivedDate, 'date', 'asc');
      expect(result[0].id).toBe('2');
      expect(result[1].id).toBe('1');
    });

    it('should handle empty date strings', () => {
      const tasksWithEmptyDates: MaintenanceTask[] = [
        {
          ...mockTasks[0],
          scheduled_date: '',
          due_date: '',
          personal_due_date: '',
          received_date: '2024-01-01', // received_date is required, keep original
        },
        {
          ...mockTasks[1],
          scheduled_date: '2024-01-01',
        },
      ];
      const result = sortTasks(tasksWithEmptyDates, 'date', 'asc');
      // Empty string sorts before '2024-01-01' in localeCompare
      expect(result[0].id).toBe('1');
      expect(result[1].id).toBe('2');
    });

    it('should default to date sort when sortBy is not specified', () => {
      const result = sortTasks(mockTasks);
      expect(result).toHaveLength(3);
    });

    it('should default to ascending order when sortOrder is not specified', () => {
      const result = sortTasks(mockTasks, 'date');
      expect(result[0].id).toBe('2');
    });

    it('should handle tasks with unknown priority', () => {
      const taskWithUnknownPriority: MaintenanceTask = {
        ...mockTasks[0],
        priority: 'unknown' as any,
      };
      const tasks = [...mockTasks, taskWithUnknownPriority];
      const result = sortTasks(tasks, 'priority', 'desc');
      expect(result).toHaveLength(4);
    });

    it('should handle tasks with unknown status', () => {
      const taskWithUnknownStatus: MaintenanceTask = {
        ...mockTasks[0],
        status: 'unknown' as any,
      };
      const tasks = [...mockTasks, taskWithUnknownStatus];
      const result = sortTasks(tasks, 'status', 'asc');
      expect(result).toHaveLength(4);
    });
  });
});

