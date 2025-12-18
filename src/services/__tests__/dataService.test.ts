import {
  applyQuery,
  invalidateCache,
  getCacheTimestamp,
  fetchClients,
  fetchInstruments,
  dataService,
} from '../dataService';
import { Client, Instrument, ClientInstrument, MaintenanceTask } from '@/types';
import { apiClient } from '@/utils/apiClient';

describe('dataService', () => {
  const sampleClients: Client[] = [
    {
      id: 'c1',
      first_name: 'Alice',
      last_name: 'Kim',
      email: 'alice@test.com',
      created_at: '2024-01-01',
      client_number: '1',
      tags: [],
      interest: null,
      note: null,
      contact_number: null,
    },
    {
      id: 'c2',
      first_name: 'Bob',
      last_name: 'Lee',
      email: 'bob@test.com',
      created_at: '2024-01-02',
      client_number: '2',
      tags: [],
      interest: null,
      note: null,
      contact_number: null,
    },
  ];

  const sampleInstruments: Instrument[] = [
    {
      id: 'i1',
      maker: 'Strad',
      type: 'Violin',
      subtype: 'Classic',
      serial_number: 'S1',
      status: 'Available',
      certificate: false,
      created_at: '2024-01-01',
      note: null,
      ownership: null,
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
      serial_number: 'S2',
      status: 'Available',
      certificate: false,
      created_at: '2024-01-02',
      note: null,
      ownership: null,
      price: null,
      size: null,
      weight: null,
      year: null,
    },
  ];

  beforeEach(() => {
    invalidateCache('clients');
    invalidateCache('instruments');
  });

  it('applies search/filter/sort via applyQuery', () => {
    const result = applyQuery(
      sampleClients,
      {
        searchTerm: 'alice',
        sortBy: 'created_at',
        sortDirection: 'desc',
        filter: { client_number: '1' },
      },
      ['first_name', 'last_name', 'email']
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('c1');
  });

  it('updates cache timestamp on fetchClients', async () => {
    const fetcher = jest.fn().mockResolvedValue(sampleClients);
    const clients = await fetchClients(fetcher, { searchTerm: 'bob' });
    expect(clients).toHaveLength(1);
    expect(getCacheTimestamp('clients')).toBeDefined();
  });

  it('updates cache timestamp on fetchInstruments', async () => {
    const fetcher = jest.fn().mockResolvedValue(sampleInstruments);
    const instruments = await fetchInstruments(fetcher, {
      searchTerm: 'strad',
    });
    expect(instruments).toHaveLength(1);
    expect(getCacheTimestamp('instruments')).toBeDefined();
  });
});

// Mock apiClient
jest.mock('@/utils/apiClient', () => ({
  apiClient: {
    query: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
}));

// Mock getSupabaseClient for withSupabase
jest.mock('@/lib/supabase-client', () => ({
  getSupabaseClient: jest.fn(),
}));

describe('DataService class', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    invalidateCache('clients');
    invalidateCache('instruments');
    invalidateCache('connections');
    invalidateCache('maintenance_tasks');
  });

  describe('Clients', () => {
    const mockClient: Client = {
      id: 'c1',
      first_name: 'Alice',
      last_name: 'Kim',
      email: 'alice@test.com',
      created_at: '2024-01-01',
      client_number: '1',
      tags: [],
      interest: null,
      note: null,
      contact_number: null,
    };

    it('should fetch clients successfully', async () => {
      (apiClient.query as jest.Mock).mockResolvedValue({
        data: [mockClient],
        error: null,
      });

      const result = await dataService.fetchClients();

      expect(result.data).toEqual([mockClient]);
      expect(result.error).toBeNull();
      expect(getCacheTimestamp('clients')).toBeDefined();
    });

    it('should handle fetch clients error', async () => {
      const mockError = { code: 'DATABASE_ERROR', message: 'Database error' };
      (apiClient.query as jest.Mock).mockResolvedValue({
        data: null,
        error: mockError,
      });

      const result = await dataService.fetchClients();

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
    });

    it('should fetch client by id', async () => {
      (apiClient.query as jest.Mock).mockResolvedValue({
        data: [mockClient],
        error: null,
      });

      const result = await dataService.fetchClientById('c1');

      expect(result.data).toEqual(mockClient);
      expect(result.error).toBeNull();
    });

    it('should create client successfully', async () => {
      const newClient = { ...mockClient, id: undefined, created_at: undefined };
      (apiClient.create as jest.Mock).mockResolvedValue({
        data: mockClient,
        error: null,
      });

      const result = await dataService.createClient(newClient);

      expect(result.data).toEqual(mockClient);
      expect(result.error).toBeNull();
      expect(getCacheTimestamp('clients')).toBeUndefined(); // Cache invalidated
    });

    it('should update client successfully', async () => {
      (apiClient.update as jest.Mock).mockResolvedValue({
        data: { ...mockClient, first_name: 'Updated' },
        error: null,
      });

      const result = await dataService.updateClient('c1', {
        first_name: 'Updated',
      });

      expect(result.data?.first_name).toBe('Updated');
      expect(result.error).toBeNull();
    });

    it('should delete client successfully', async () => {
      (apiClient.delete as jest.Mock).mockResolvedValue({
        success: true,
        error: null,
      });

      const result = await dataService.deleteClient('c1');

      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
    });
  });

  describe('Instruments', () => {
    const mockInstrument: Instrument = {
      id: 'i1',
      maker: 'Strad',
      type: 'Violin',
      subtype: 'Classic',
      serial_number: 'S1',
      status: 'Available',
      certificate: false,
      created_at: '2024-01-01',
      note: null,
      ownership: null,
      price: null,
      size: null,
      weight: null,
      year: null,
    };

    it('should fetch instruments successfully', async () => {
      (apiClient.query as jest.Mock).mockResolvedValue({
        data: [mockInstrument],
        error: null,
      });

      const result = await dataService.fetchInstruments();

      expect(result.data).toEqual([mockInstrument]);
      expect(result.error).toBeNull();
      expect(getCacheTimestamp('instruments')).toBeDefined();
    });

    it('should fetch instrument by id', async () => {
      (apiClient.query as jest.Mock).mockResolvedValue({
        data: [mockInstrument],
        error: null,
      });

      const result = await dataService.fetchInstrumentById('i1');

      expect(result.data).toEqual(mockInstrument);
      expect(result.error).toBeNull();
    });

    it('should create instrument successfully', async () => {
      const newInstrument = {
        ...mockInstrument,
        id: undefined,
        created_at: undefined,
      };
      (apiClient.create as jest.Mock).mockResolvedValue({
        data: mockInstrument,
        error: null,
      });

      const result = await dataService.createInstrument(newInstrument);

      expect(result.data).toEqual(mockInstrument);
      expect(result.error).toBeNull();
    });

    it('should update instrument successfully', async () => {
      (apiClient.update as jest.Mock).mockResolvedValue({
        data: { ...mockInstrument, status: 'Sold' },
        error: null,
      });

      const result = await dataService.updateInstrument('i1', {
        status: 'Sold',
      });

      expect(result.data?.status).toBe('Sold');
      expect(result.error).toBeNull();
    });

    it('should delete instrument successfully', async () => {
      (apiClient.delete as jest.Mock).mockResolvedValue({
        success: true,
        error: null,
      });

      const result = await dataService.deleteInstrument('i1');

      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
    });
  });

  describe('Connections', () => {
    const mockConnection: ClientInstrument = {
      id: 'conn1',
      client_id: 'c1',
      instrument_id: 'i1',
      relationship_type: 'Owned',
      notes: null,
      created_at: '2024-01-01',
    };

    it('should fetch connections successfully', async () => {
      (apiClient.query as jest.Mock).mockResolvedValue({
        data: [mockConnection],
        error: null,
      });

      const result = await dataService.fetchConnections();

      expect(result.data).toEqual([mockConnection]);
      expect(result.error).toBeNull();
      expect(getCacheTimestamp('connections')).toBeDefined();
    });

    it('should create connection successfully', async () => {
      const newConnection = {
        ...mockConnection,
        id: undefined,
        created_at: undefined,
      };
      (apiClient.create as jest.Mock).mockResolvedValue({
        data: mockConnection,
        error: null,
      });

      const result = await dataService.createConnection(newConnection);

      expect(result.data).toEqual(mockConnection);
      expect(result.error).toBeNull();
    });

    it('should update connection successfully', async () => {
      (apiClient.update as jest.Mock).mockResolvedValue({
        data: { ...mockConnection, relationship_type: 'Sold' },
        error: null,
      });

      const result = await dataService.updateConnection('conn1', {
        relationship_type: 'Sold',
      });

      expect(result.data?.relationship_type).toBe('Sold');
      expect(result.error).toBeNull();
    });

    it('should delete connection successfully', async () => {
      (apiClient.delete as jest.Mock).mockResolvedValue({
        success: true,
        error: null,
      });

      const result = await dataService.deleteConnection('conn1');

      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
    });
  });

  describe('Maintenance Tasks', () => {
    const mockTask: MaintenanceTask = {
      id: 'task1',
      instrument_id: 'i1',
      client_id: null,
      title: 'Test Task',
      description: null,
      task_type: 'repair',
      status: 'pending',
      priority: 'medium',
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
    };

    it('should fetch maintenance tasks successfully', async () => {
      // Mock getSupabaseClient for withSupabase
      const mockSupabase = {
        from: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          gte: jest.fn().mockReturnThis(),
          lte: jest.fn().mockReturnThis(),
          or: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValue({
            data: [mockTask],
            error: null,
          }),
        })),
      };

      const { getSupabaseClient } = require('@/lib/supabase-client');
      (getSupabaseClient as jest.Mock).mockResolvedValue(mockSupabase);

      const result = await dataService.fetchMaintenanceTasks();

      expect(result.data).toBeDefined();
      expect(result.error).toBeNull();
    });

    it('should fetch maintenance task by id', async () => {
      (apiClient.query as jest.Mock).mockResolvedValue({
        data: [mockTask],
        error: null,
      });

      const result = await dataService.fetchMaintenanceTaskById('task1');

      expect(result.data).toEqual(mockTask);
      expect(result.error).toBeNull();
    });

    it('should create maintenance task successfully', async () => {
      const newTask = {
        ...mockTask,
        id: undefined,
        created_at: undefined,
        updated_at: undefined,
      };
      (apiClient.create as jest.Mock).mockResolvedValue({
        data: mockTask,
        error: null,
      });

      const result = await dataService.createMaintenanceTask(newTask);

      expect(result.data).toEqual(mockTask);
      expect(result.error).toBeNull();
    });

    it('should update maintenance task successfully', async () => {
      (apiClient.update as jest.Mock).mockResolvedValue({
        data: { ...mockTask, status: 'completed' },
        error: null,
      });

      const result = await dataService.updateMaintenanceTask('task1', {
        status: 'completed',
      });

      expect(result.data?.status).toBe('completed');
      expect(result.error).toBeNull();
    });

    it('should delete maintenance task successfully', async () => {
      (apiClient.delete as jest.Mock).mockResolvedValue({
        success: true,
        error: null,
      });

      const result = await dataService.deleteMaintenanceTask('task1');

      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
    });
  });
});
