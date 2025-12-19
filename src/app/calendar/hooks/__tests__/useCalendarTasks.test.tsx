import { renderHook } from '@/test-utils/render';
import { useCalendarTasks } from '../useCalendarTasks';
import { Client, Instrument, MaintenanceTask } from '@/types';

const mockClients: Client[] = [
  {
    id: 'c1',
    first_name: 'John',
    last_name: 'Doe',
    email: 'john@example.com',
    created_at: '2024-01-01',
    client_number: '1',
    tags: [],
    interest: null,
    note: null,
    contact_number: null,
  },
  {
    id: 'c2',
    first_name: 'Jane',
    last_name: 'Smith',
    email: 'jane@example.com',
    created_at: '2024-01-02',
    client_number: '2',
    tags: [],
    interest: null,
    note: null,
    contact_number: null,
  },
];

const mockInstruments: Instrument[] = [
  {
    id: 'i1',
    maker: 'Stradivarius',
    type: 'Violin',
    subtype: 'Classic',
    serial_number: 'VI001',
    status: 'Available',
    certificate: false,
    created_at: '2024-01-01',
    note: null,
    ownership: 'John Doe',
    price: null,
    size: null,
    weight: null,
    year: null,
  },
  {
    id: 'i2',
    maker: 'Guarneri',
    type: 'Cello',
    subtype: null,
    serial_number: 'CE001',
    status: 'Sold',
    certificate: false,
    created_at: '2024-01-02',
    note: null,
    ownership: 'Jane Smith',
    price: null,
    size: null,
    weight: null,
    year: null,
  },
];

const mockTasks: MaintenanceTask[] = [
  {
    id: 'task1',
    instrument_id: 'i1',
    client_id: null,
    title: 'Repair',
    description: null,
    task_type: 'repair',
    status: 'pending',
    priority: 'high',
    received_date: '2024-01-01',
    scheduled_date: null,
    due_date: null,
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
    title: 'Maintenance',
    description: null,
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

describe('useCalendarTasks', () => {
  it('should create instruments map with client info', () => {
    const { result } = renderHook(() =>
      useCalendarTasks({
        tasks: mockTasks,
        instruments: mockInstruments,
        clients: mockClients,
      })
    );

    expect(result.current.instrumentsMap.size).toBe(2);
    expect(result.current.instrumentsMap.get('i1')).toEqual({
      type: 'Violin',
      maker: 'Stradivarius',
      ownership: 'John Doe',
      serial_number: 'VI001',
      clientId: 'c1',
      clientName: 'John Doe',
    });
  });

  it('should create clients map', () => {
    const { result } = renderHook(() =>
      useCalendarTasks({
        tasks: mockTasks,
        instruments: mockInstruments,
        clients: mockClients,
      })
    );

    expect(result.current.clientsMap.size).toBe(2);
    expect(result.current.clientsMap.get('c1')).toEqual({
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
    });
  });

  it('should extract ownership options', () => {
    const { result } = renderHook(() =>
      useCalendarTasks({
        tasks: mockTasks,
        instruments: mockInstruments,
        clients: mockClients,
      })
    );

    expect(result.current.ownershipOptions).toContain('John Doe');
    expect(result.current.ownershipOptions).toContain('Jane Smith');
  });

  it('should create filter options from tasks', () => {
    const { result } = renderHook(() =>
      useCalendarTasks({
        tasks: mockTasks,
        instruments: mockInstruments,
        clients: mockClients,
      })
    );

    expect(result.current.filterOptions.types).toContain('repair');
    expect(result.current.filterOptions.types).toContain('maintenance');
    expect(result.current.filterOptions.priorities).toContain('high');
    expect(result.current.filterOptions.priorities).toContain('medium');
    expect(result.current.filterOptions.statuses).toContain('pending');
    expect(result.current.filterOptions.statuses).toContain('completed');
  });

  it('should calculate summary stats from filtered tasks', () => {
    const filteredTasks = [mockTasks[0]]; // Only pending task
    const { result } = renderHook(() =>
      useCalendarTasks({
        tasks: mockTasks,
        instruments: mockInstruments,
        clients: mockClients,
        filteredTasks,
      })
    );

    expect(result.current.summaryStats).toBeDefined();
    expect(result.current.summaryStats.total).toBe(1);
  });

  it('should handle empty tasks array', () => {
    const { result } = renderHook(() =>
      useCalendarTasks({
        tasks: [],
        instruments: [],
        clients: [],
      })
    );

    expect(result.current.instrumentsMap.size).toBe(0);
    expect(result.current.clientsMap.size).toBe(0);
    expect(result.current.ownershipOptions).toEqual([]);
    expect(result.current.filterOptions.types).toEqual([]);
  });

  it('should handle instruments without ownership', () => {
    const instrumentWithoutOwnership: Instrument = {
      ...mockInstruments[0],
      ownership: null,
    };

    const { result } = renderHook(() =>
      useCalendarTasks({
        tasks: mockTasks,
        instruments: [instrumentWithoutOwnership],
        clients: mockClients,
      })
    );

    const instrumentData = result.current.instrumentsMap.get('i1');
    expect(instrumentData?.clientId).toBeNull();
    expect(instrumentData?.clientName).toBeNull();
  });

  it('should handle empty tasks array', () => {
    const { result } = renderHook(() =>
      useCalendarTasks({
        tasks: [],
        instruments: [],
        clients: [],
      })
    );

    // Filter options should still be created even with empty tasks
    expect(result.current.filterOptions).toBeDefined();
    expect(result.current.filterOptions.types).toEqual([]);
  });
});
