import { NextRequest } from 'next/server';
import { GET, POST, PATCH, DELETE } from '../route';
// errorHandler is mocked but not directly used in tests

jest.mock('@/utils/errorHandler');
jest.mock('@/utils/logger');
jest.mock('@/utils/monitoring');
jest.mock('@/utils/typeGuards');
jest.mock('@/utils/inputValidation');
jest.mock('@/utils/dateParsing');

let mockUserSupabase: any;
let mockAuthContext: any;

jest.mock('@/app/api/_utils/withAuthRoute', () => {
  const actual = jest.requireActual('@/app/api/_utils/withAuthRoute');
  return {
    ...actual,
    withAuthRoute: (handler: any) => async (request: any, context?: any) =>
      handler(
        request,
        {
          ...mockAuthContext,
          userSupabase: mockUserSupabase,
        },
        context
      ),
  };
});

// Mock typeGuards
jest.mock('@/utils/typeGuards', () => {
  const actual = jest.requireActual('@/utils/typeGuards');
  return {
    ...actual,
    safeValidate: jest.fn(data => ({
      success: true,
      data,
    })),
    validateMaintenanceTask: jest.fn(data => data),
    validateMaintenanceTaskArray: jest.fn(data => data),
    validateCreateMaintenanceTask: jest.fn(data => data),
    validatePartialMaintenanceTask: jest.fn(data => data),
  };
});

// Mock inputValidation
jest.mock('@/utils/inputValidation', () => {
  const mockValidateDateString = jest.fn(value =>
    /^\d{4}-\d{2}-\d{2}$/.test(value)
  );
  return {
    validateUUID: jest.fn(value =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        value
      )
    ),
    sanitizeSearchTerm: jest.fn(value => value?.trim()),
    validateDateString: mockValidateDateString,
  };
});

// Mock dateParsing
jest.mock('@/utils/dateParsing', () => ({
  todayLocalYMD: jest.fn(() => '2024-01-20'),
}));

describe('/api/maintenance-tasks', () => {
  const TEST_ORG_ID = '123e4567-e89b-12d3-a456-426614174099';

  const mockTask = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    instrument_id: '123e4567-e89b-12d3-a456-426614174001',
    title: 'String replacement',
    description: 'Replace all strings',
    status: 'pending',
    task_type: 'repair',
    priority: 'high',
    scheduled_date: '2024-01-25',
    due_date: '2024-01-30',
    received_date: '2024-01-15',
    personal_due_date: null,
    completed_at: null,
    created_at: '2024-01-15T00:00:00Z',
    updated_at: '2024-01-15T00:00:00Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    const { safeValidate } = require('@/utils/typeGuards');
    (safeValidate as jest.Mock).mockImplementation((data: unknown) => ({
      success: true,
      data,
    }));
    jest.spyOn(performance, 'now').mockReturnValue(0);
    const baseQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: mockTask, error: null }),
      maybeSingle: jest.fn().mockResolvedValue({ data: mockTask, error: null }),
    };
    (baseQuery.order as jest.Mock).mockImplementation(() => baseQuery);
    mockUserSupabase = {
      from: jest.fn().mockReturnValue(baseQuery),
    };
    mockAuthContext = {
      user: { id: 'test-user' },
      accessToken: 'test-token',
      orgId: TEST_ORG_ID,
      clientId: 'test-client',
      role: 'admin',
      userSupabase: mockUserSupabase,
      isTestBypass: false,
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('GET', () => {
    it('should return maintenance tasks', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
      };
      (mockQuery.order as jest.Mock).mockResolvedValue({
        data: [mockTask],
        error: null,
        count: 1,
      });

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockQuery),
      };

      const request = new NextRequest('http://localhost/api/maintenance-tasks');
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data).toEqual([mockTask]);
      expect(json.count).toBe(1);
      expect(mockQuery.eq).toHaveBeenCalledWith('org_id', TEST_ORG_ID);
    });

    it('should reject GET when org context is missing', async () => {
      mockAuthContext = {
        ...mockAuthContext,
        orgId: null,
      };

      const request = new NextRequest('http://localhost/api/maintenance-tasks');
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(403);
      expect(json).toMatchObject({
        message: 'Organization context required',
        retryable: false,
      });
      expect(mockUserSupabase.from).not.toHaveBeenCalled();
    });

    it('should fetch task by id', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn(),
      };
      (mockQuery.single as jest.Mock).mockResolvedValue({
        data: mockTask,
        error: null,
      });

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockQuery),
      };

      const request = new NextRequest(
        `http://localhost/api/maintenance-tasks?id=${mockTask.id}`
      );
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data).toEqual(mockTask);
      expect(mockQuery.eq).toHaveBeenCalledWith('org_id', TEST_ORG_ID);
    });

    it('should return 400 for invalid task id format', async () => {
      const { validateUUID } = require('@/utils/inputValidation');
      (validateUUID as jest.Mock)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);

      const request = new NextRequest(
        'http://localhost/api/maintenance-tasks?id=invalid'
      );
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json).toMatchObject({
        message: 'Invalid task ID format',
        retryable: false,
      });
    });

    it('should filter by instrument_id', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
      };
      (mockQuery.order as jest.Mock).mockResolvedValue({
        data: [mockTask],
        error: null,
        count: 1,
      });

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockQuery),
      };

      const request = new NextRequest(
        `http://localhost/api/maintenance-tasks?instrument_id=${mockTask.instrument_id}`
      );
      await GET(request);

      expect(mockQuery.eq).toHaveBeenCalledWith(
        'instrument_id',
        mockTask.instrument_id
      );
    });

    it('should filter by status', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
      };
      (mockQuery.order as jest.Mock).mockResolvedValue({
        data: [mockTask],
        error: null,
        count: 1,
      });

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockQuery),
      };

      const request = new NextRequest(
        'http://localhost/api/maintenance-tasks?status=pending'
      );
      await GET(request);

      expect(mockQuery.eq).toHaveBeenCalledWith('status', 'pending');
    });

    it('should filter by task_type', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
      };
      (mockQuery.order as jest.Mock).mockResolvedValue({
        data: [mockTask],
        error: null,
        count: 1,
      });

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockQuery),
      };

      const request = new NextRequest(
        'http://localhost/api/maintenance-tasks?task_type=repair'
      );
      await GET(request);

      expect(mockQuery.eq).toHaveBeenCalledWith('task_type', 'repair');
    });

    it('should filter by scheduled_date', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
      };
      (mockQuery.order as jest.Mock)
        .mockImplementationOnce(() => mockQuery)
        .mockResolvedValue({
          data: [mockTask],
          error: null,
          count: 1,
        });

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockQuery),
      };

      const request = new NextRequest(
        'http://localhost/api/maintenance-tasks?scheduled_date=2024-01-25'
      );
      await GET(request);

      expect(mockQuery.eq).toHaveBeenCalledWith('scheduled_date', '2024-01-25');
    });

    it('should return 400 for invalid scheduled_date format', async () => {
      const { validateDateString } = require('@/utils/inputValidation');
      (validateDateString as jest.Mock).mockReturnValueOnce(false);

      const request = new NextRequest(
        'http://localhost/api/maintenance-tasks?scheduled_date=invalid-date'
      );
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.message).toContain('Invalid scheduled_date format');
    });

    it('should filter by date range', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
      };
      (mockQuery.lte as jest.Mock).mockResolvedValue({
        data: [mockTask],
        error: null,
      });

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockQuery),
      };

      const request = new NextRequest(
        'http://localhost/api/maintenance-tasks?startDate=2024-01-01&endDate=2024-01-31'
      );
      const response = await GET(request);

      // Verify the response is successful (200)
      // The date range filter should be applied when both startDate and endDate are provided
      // validateDateString is mocked to return true for valid YYYY-MM-DD format by default
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.data).toBeDefined();
      expect(json.count).toBe(1);
      expect(mockUserSupabase.from).toHaveBeenCalledTimes(4);
      expect(mockQuery.gte).toHaveBeenCalledWith(
        expect.stringMatching(
          /received_date|scheduled_date|due_date|personal_due_date/
        ),
        '2024-01-01'
      );
      expect(mockQuery.lte).toHaveBeenCalledWith(
        expect.stringMatching(
          /received_date|scheduled_date|due_date|personal_due_date/
        ),
        '2024-01-31'
      );
    });

    it('should tolerate missing optional personal_due_date column in date range queries', async () => {
      const successQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockResolvedValue({
          data: [mockTask],
          error: null,
        }),
      };
      const missingColumnQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockResolvedValue({
          data: null,
          error: {
            code: 'PGRST204',
            message:
              "Could not find the 'personal_due_date' column of 'maintenance_tasks' in the schema cache",
          },
        }),
      };

      mockUserSupabase = {
        from: jest
          .fn()
          .mockReturnValueOnce(successQuery)
          .mockReturnValueOnce(successQuery)
          .mockReturnValueOnce(successQuery)
          .mockReturnValueOnce(missingColumnQuery),
      };

      const request = new NextRequest(
        'http://localhost/api/maintenance-tasks?start_date=2024-01-01&end_date=2024-01-31'
      );
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data).toEqual([mockTask]);
      expect(json.count).toBe(1);
    });

    it('should filter by overdue', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        or: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
      };
      (mockQuery.order as jest.Mock).mockResolvedValue({
        data: [mockTask],
        error: null,
        count: 1,
      });

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockQuery),
      };

      const request = new NextRequest(
        'http://localhost/api/maintenance-tasks?overdue=true'
      );
      await GET(request);

      expect(mockQuery.in).toHaveBeenCalledWith('status', [
        'pending',
        'in_progress',
      ]);
      expect(mockQuery.or).toHaveBeenCalled();
    });

    it('should filter by priority', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
      };
      (mockQuery.order as jest.Mock).mockResolvedValue({
        data: [mockTask],
        error: null,
        count: 1,
      });

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockQuery),
      };

      const request = new NextRequest(
        'http://localhost/api/maintenance-tasks?priority=high'
      );
      await GET(request);

      expect(mockQuery.eq).toHaveBeenCalledWith('priority', 'high');
    });

    it('should filter by search term', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        or: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
      };
      (mockQuery.order as jest.Mock).mockResolvedValue({
        data: [mockTask],
        error: null,
        count: 1,
      });

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockQuery),
      };

      const request = new NextRequest(
        'http://localhost/api/maintenance-tasks?search=string'
      );
      await GET(request);

      expect(mockQuery.or).toHaveBeenCalled();
    });

    it('should return 400 for invalid instrument_id', async () => {
      const { validateUUID } = require('@/utils/inputValidation');
      (validateUUID as jest.Mock)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);

      const request = new NextRequest(
        'http://localhost/api/maintenance-tasks?instrument_id=invalid'
      );
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.message).toBe('Invalid instrument_id format');
    });
  });

  describe('POST', () => {
    it('should create a new maintenance task', async () => {
      const createData = {
        instrument_id: mockTask.instrument_id,
        title: 'New task',
        description: 'Task description',
        status: 'pending',
        task_type: 'repair',
        priority: 'medium',
        scheduled_date: '2024-02-01',
        due_date: '2024-02-10',
        received_date: '2024-01-20',
      };

      const mockQuery = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn(),
      };
      (mockQuery.single as jest.Mock).mockResolvedValue({
        data: { ...mockTask, ...createData },
        error: null,
      });

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockQuery),
      };

      const request = new NextRequest(
        'http://localhost/api/maintenance-tasks',
        {
          method: 'POST',
          body: JSON.stringify(createData),
        }
      );
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(201);
      expect(json.data).toBeDefined();
      expect(mockQuery.insert).toHaveBeenCalled();
    });

    it('should return 403 when the user is not an admin (matches maintenance_tasks_insert RLS)', async () => {
      mockAuthContext = { ...mockAuthContext, role: 'member' };

      const createData = {
        instrument_id: mockTask.instrument_id,
        title: 'T',
        description: 'D',
        status: 'pending' as const,
        task_type: 'repair' as const,
        priority: 'high' as const,
        scheduled_date: '2024-02-01',
        due_date: '2024-02-10',
        received_date: '2024-01-20',
      };

      const request = new NextRequest(
        'http://localhost/api/maintenance-tasks',
        {
          method: 'POST',
          body: JSON.stringify(createData),
        }
      );
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(403);
      expect(json.error).toBe('Admin role required');
      expect(mockUserSupabase.from).not.toHaveBeenCalled();
    });

    it('should return 400 for invalid data', async () => {
      const request = new NextRequest(
        'http://localhost/api/maintenance-tasks',
        {
          method: 'POST',
          body: JSON.stringify({ invalid: 'data' }),
        }
      );

      const { safeValidate } = require('@/utils/typeGuards');
      (safeValidate as jest.Mock).mockReturnValueOnce({
        success: false,
        error: 'Invalid maintenance task data',
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.message).toContain('Invalid maintenance task data');
    });

    it('returns 422 when persisted row fails validateMaintenanceTask', async () => {
      const actualTg = jest.requireActual('@/utils/typeGuards');
      const tg = require('@/utils/typeGuards');
      const { safeValidate } = tg;
      (safeValidate as jest.Mock).mockImplementation(
        (data: unknown, validator: unknown) => {
          if (validator === tg.validateCreateMaintenanceTask) {
            return actualTg.safeValidate(
              data,
              actualTg.validateCreateMaintenanceTask
            );
          }
          if (validator === tg.validateMaintenanceTask) {
            return { success: false, error: 'invalid persisted row' };
          }
          return { success: true, data };
        }
      );

      const createData = {
        instrument_id: mockTask.instrument_id,
        client_id: null,
        title: 'New task',
        description: null,
        status: 'pending' as const,
        task_type: 'repair' as const,
        priority: 'medium' as const,
        scheduled_date: null,
        due_date: null,
        personal_due_date: null,
        received_date: '2024-01-20',
        completed_date: null,
        estimated_hours: null,
        actual_hours: null,
        cost: null,
        notes: null,
      };

      const mockQuery = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn(),
      };
      (mockQuery.single as jest.Mock).mockResolvedValue({
        data: { ...mockTask, ...createData },
        error: null,
      });

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockQuery),
      };

      const request = new NextRequest(
        'http://localhost/api/maintenance-tasks',
        {
          method: 'POST',
          body: JSON.stringify(createData),
        }
      );
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(422);
      expect(json.error_code).toBe('maintenance_task_response_invalid');
      expect(String(json.message)).toMatch(/validation|invalid/i);
    });
  });

  describe('PATCH', () => {
    it('should update an existing maintenance task', async () => {
      const updates = { status: 'in_progress', priority: 'high' };
      const updatedTask = { ...mockTask, ...updates };

      const mockQuery = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn(),
      };
      (mockQuery.single as jest.Mock).mockResolvedValue({
        data: updatedTask,
        error: null,
      });

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockQuery),
      };

      const request = new NextRequest(
        'http://localhost/api/maintenance-tasks',
        {
          method: 'PATCH',
          body: JSON.stringify({ id: mockTask.id, ...updates }),
        }
      );
      const response = await PATCH(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data).toBeDefined();
      expect(mockQuery.eq).toHaveBeenCalledWith('id', mockTask.id);
      expect(mockQuery.eq).toHaveBeenCalledWith('org_id', TEST_ORG_ID);
      expect(mockQuery.update).toHaveBeenCalled();
    });

    it('should return 400 when id is missing', async () => {
      const request = new NextRequest(
        'http://localhost/api/maintenance-tasks',
        {
          method: 'PATCH',
          body: JSON.stringify({ status: 'completed' }),
        }
      );
      const response = await PATCH(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.message).toBe('Task ID is required');
    });

    it('should return 400 for invalid UUID', async () => {
      const { validateUUID } = require('@/utils/inputValidation');
      (validateUUID as jest.Mock)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);

      const request = new NextRequest(
        'http://localhost/api/maintenance-tasks',
        {
          method: 'PATCH',
          body: JSON.stringify({ id: 'invalid-id', status: 'completed' }),
        }
      );
      const response = await PATCH(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.message).toBe('Invalid task ID format');
    });

    it('should return 409 for invalid maintenance task status transition', async () => {
      const statusQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { status: 'completed' },
          error: null,
        }),
      };
      const updateQuery = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn(),
      };
      (updateQuery.single as jest.Mock).mockResolvedValue({
        data: { ...mockTask, status: 'pending' },
        error: null,
      });

      mockUserSupabase = {
        from: jest
          .fn()
          .mockReturnValueOnce(statusQuery)
          .mockReturnValueOnce(updateQuery),
      };

      const request = new NextRequest(
        'http://localhost/api/maintenance-tasks',
        {
          method: 'PATCH',
          body: JSON.stringify({ id: mockTask.id, status: 'pending' }),
        }
      );
      const response = await PATCH(request);
      const json = await response.json();

      expect(response.status).toBe(409);
      expect(json.message).toContain(
        'Invalid maintenance task status transition'
      );
      expect(updateQuery.update).not.toHaveBeenCalled();
    });

    it('returns 422 when updated row fails validateMaintenanceTask', async () => {
      const actualTg = jest.requireActual('@/utils/typeGuards');
      const tg = require('@/utils/typeGuards');
      const { safeValidate } = tg;
      (safeValidate as jest.Mock).mockImplementation(
        (data: unknown, validator: unknown) => {
          if (validator === tg.validatePartialMaintenanceTask) {
            return actualTg.safeValidate(
              data,
              actualTg.validatePartialMaintenanceTask
            );
          }
          if (validator === tg.validateMaintenanceTask) {
            return { success: false, error: 'invalid persisted row' };
          }
          return { success: true, data };
        }
      );

      const updateQuery = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn(),
      };
      (updateQuery.single as jest.Mock).mockResolvedValue({
        data: { ...mockTask, priority: 'low' },
        error: null,
      });

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(updateQuery),
      };

      const request = new NextRequest(
        'http://localhost/api/maintenance-tasks',
        {
          method: 'PATCH',
          body: JSON.stringify({ id: mockTask.id, priority: 'low' }),
        }
      );
      const response = await PATCH(request);
      const json = await response.json();

      expect(response.status).toBe(422);
      expect(json.error_code).toBe('maintenance_task_response_invalid');
      expect(String(json.message)).toMatch(/validation|invalid/i);
    });
  });

  describe('DELETE', () => {
    it('should delete a maintenance task', async () => {
      const mockQuery = {
        delete: jest.fn().mockReturnThis(),
        error: null,
        count: 1,
        eq: jest.fn().mockReturnThis(),
      };

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockQuery),
      };

      const request = new NextRequest(
        `http://localhost/api/maintenance-tasks?id=${mockTask.id}`
      );
      const response = await DELETE(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(mockQuery.eq).toHaveBeenCalledWith('id', mockTask.id);
      expect(mockQuery.eq).toHaveBeenCalledWith('org_id', TEST_ORG_ID);
      expect(mockQuery.delete).toHaveBeenCalled();
    });

    it('should return 400 when id is missing', async () => {
      const request = new NextRequest('http://localhost/api/maintenance-tasks');
      const response = await DELETE(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.message).toBe('Task ID is required');
    });

    it('should return 400 for invalid UUID', async () => {
      const { validateUUID } = require('@/utils/inputValidation');
      (validateUUID as jest.Mock).mockReturnValueOnce(false);

      const request = new NextRequest(
        'http://localhost/api/maintenance-tasks?id=invalid'
      );
      const response = await DELETE(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.message).toBe('Invalid task ID format');
    });
  });
});
