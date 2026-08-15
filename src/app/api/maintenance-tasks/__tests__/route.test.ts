import { NextRequest } from 'next/server';
import { GET, POST, PATCH, DELETE } from '../route';
// errorHandler is mocked but not directly used in tests

jest.mock('@/utils/errorHandler');
jest.mock('@/utils/logger');
jest.mock('@/utils/monitoring');
jest.mock('@/utils/typeGuards');
jest.mock('@/utils/inputValidation');
jest.mock('@/utils/dateParsing');
jest.mock('@/app/api/_utils/rateLimit', () => ({
  searchRateLimit: null,
  exportRateLimit: null,
  authRateLimit: null,
  mutationRateLimit: null,
  uploadRateLimit: null,
  destructiveMutationRateLimit: null,
  applyRateLimit: jest.fn().mockResolvedValue({ limited: false }),
  applyScopedRateLimit: jest.fn().mockResolvedValue({ limited: false }),
  tooManyRequestsApiResult: () => ({
    payload: { error: 'Too many requests', success: false },
    status: 429,
  }),
}));

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
        range: jest.fn().mockResolvedValue({
          data: [mockTask],
          error: null,
          count: 1,
        }),
      };

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

    it('should return 400 for invalid task_type query', async () => {
      const request = new NextRequest(
        'http://localhost/api/maintenance-tasks?task_type=not_a_real_type'
      );
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toContain('Invalid task_type');
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

    it('should filter by calendar_date range using canonical placement date', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        not: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({
          data: [mockTask],
          error: null,
          count: 1,
        }),
      };

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockQuery),
      };

      const request = new NextRequest(
        'http://localhost/api/maintenance-tasks?startDate=2024-01-01&endDate=2024-01-31'
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.data).toBeDefined();
      expect(json.count).toBe(1);
      expect(json.complete).toBe(true);
      expect(mockUserSupabase.from).toHaveBeenCalledTimes(1);
      expect(mockQuery.gte).toHaveBeenCalledWith('calendar_date', '2024-01-01');
      expect(mockQuery.lte).toHaveBeenCalledWith('calendar_date', '2024-01-31');
      expect(mockQuery.not).toHaveBeenCalledWith('calendar_date', 'is', null);
      expect(mockQuery.order).toHaveBeenCalledWith('calendar_date', {
        ascending: true,
      });
      expect(mockQuery.order).toHaveBeenCalledWith('received_date', {
        ascending: false,
      });
      expect(mockQuery.order).toHaveBeenCalledWith('id', { ascending: true });
    });

    it('should return incomplete range metadata when pagination is required', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        not: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({
          data: [mockTask],
          error: null,
          count: 2,
        }),
      };

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockQuery),
      };

      const request = new NextRequest(
        'http://localhost/api/maintenance-tasks?start_date=2024-01-01&end_date=2024-01-31&pageSize=1'
      );
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.capped).toBe(true);
      expect(json.complete).toBe(false);
      expect(json.count).toBe(2);
      expect(json.data).toHaveLength(1);
    });

    it('should return 503 when calendar_date column is unavailable', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        not: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({
          data: null,
          error: {
            code: '42703',
            message: 'column maintenance_tasks.calendar_date does not exist',
          },
          count: null,
        }),
      };

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockQuery),
      };

      const request = new NextRequest(
        'http://localhost/api/maintenance-tasks?start_date=2024-01-01&end_date=2024-01-31'
      );
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(503);
      expect(json.error_code).toBe('maintenance_tasks_calendar_date_missing');
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
    const T0 = '2024-01-15T00:00:00Z';
    const T1 = '2024-01-15T01:00:00Z';

    function patchRequest(body: Record<string, unknown>) {
      return new NextRequest('http://localhost/api/maintenance-tasks', {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
    }

    function mockUpdateChain(result: { data: unknown; error: unknown }) {
      return {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue(result),
      };
    }

    function mockExistsChain(existing: { id: string } | null) {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: existing,
          error: null,
        }),
      };
    }

    it('should update an existing maintenance task', async () => {
      const updates = { notes: 'Needs inspection', priority: 'high' };
      const updatedTask = {
        ...mockTask,
        ...updates,
        updated_at: T1,
      };

      const mockQuery = mockUpdateChain({
        data: [updatedTask],
        error: null,
      });

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockQuery),
      };

      const request = patchRequest({
        id: mockTask.id,
        expected_updated_at: T0,
        ...updates,
      });
      const response = await PATCH(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data).toBeDefined();
      expect(json.data.updated_at).toBe(T1);
      expect(mockQuery.eq).toHaveBeenCalledWith('id', mockTask.id);
      expect(mockQuery.eq).toHaveBeenCalledWith('org_id', TEST_ORG_ID);
      expect(mockQuery.eq).toHaveBeenCalledWith('updated_at', T0);
      expect(mockQuery.update).toHaveBeenCalled();
      const updatePayload = (mockQuery.update as jest.Mock).mock.calls[0][0];
      expect(updatePayload).not.toHaveProperty('expected_updated_at');
      expect(updatePayload).not.toHaveProperty('updated_at');
    });

    it('does not persist created_at or client-supplied updated_at from PATCH body', async () => {
      const actualTg = jest.requireActual('@/utils/typeGuards');
      const tg = require('@/utils/typeGuards');
      (tg.safeValidate as jest.Mock).mockImplementation(
        (data: unknown, validator: unknown) => {
          if (validator === tg.validatePartialMaintenanceTask) {
            return actualTg.safeValidate(
              data,
              actualTg.validatePartialMaintenanceTask
            );
          }
          return { success: true, data };
        }
      );

      const mockQuery = mockUpdateChain({
        data: [{ ...mockTask, priority: 'low', updated_at: T1 }],
        error: null,
      });

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockQuery),
      };

      const request = patchRequest({
        id: mockTask.id,
        expected_updated_at: T0,
        priority: 'low',
        created_at: '1999-01-01T00:00:00Z',
        updated_at: '1999-01-02T00:00:00Z',
      });
      const response = await PATCH(request);

      expect(response.status).toBe(200);
      const updatePayload = (mockQuery.update as jest.Mock).mock.calls[0][0];
      expect(updatePayload).toEqual(
        expect.objectContaining({ priority: 'low' })
      );
      expect(updatePayload).not.toHaveProperty('created_at');
      expect(updatePayload).not.toHaveProperty('updated_at');
      expect(updatePayload).not.toHaveProperty('expected_updated_at');
      expect(mockQuery.eq).toHaveBeenCalledWith('updated_at', T0);
    });

    it('should return 400 when id is missing', async () => {
      const request = patchRequest({
        status: 'completed',
        expected_updated_at: T0,
      });
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

      const request = patchRequest({
        id: 'invalid-id',
        expected_updated_at: T0,
        status: 'completed',
      });
      const response = await PATCH(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.message).toBe('Invalid task ID format');
    });

    it('rejects missing expected_updated_at', async () => {
      const request = patchRequest({
        id: mockTask.id,
        notes: 'Needs inspection',
      });
      const response = await PATCH(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error_code).toBe(
        'MAINTENANCE_TASK_EXPECTED_UPDATED_AT_REQUIRED'
      );
      expect(mockUserSupabase.from).not.toHaveBeenCalled();
    });

    it('rejects empty expected_updated_at', async () => {
      const request = patchRequest({
        id: mockTask.id,
        expected_updated_at: '   ',
        notes: 'Needs inspection',
      });
      const response = await PATCH(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error_code).toBe(
        'MAINTENANCE_TASK_EXPECTED_UPDATED_AT_REQUIRED'
      );
      expect(mockUserSupabase.from).not.toHaveBeenCalled();
    });

    it('rejects malformed expected_updated_at', async () => {
      const request = patchRequest({
        id: mockTask.id,
        expected_updated_at: 'not-a-timestamp',
        notes: 'Needs inspection',
      });
      const response = await PATCH(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error_code).toBe(
        'MAINTENANCE_TASK_EXPECTED_UPDATED_AT_INVALID'
      );
      expect(mockUserSupabase.from).not.toHaveBeenCalled();
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
      const updateQuery = mockUpdateChain({
        data: [{ ...mockTask, status: 'pending' }],
        error: null,
      });

      mockUserSupabase = {
        from: jest
          .fn()
          .mockReturnValueOnce(statusQuery)
          .mockReturnValueOnce(updateQuery),
      };

      const request = patchRequest({
        id: mockTask.id,
        expected_updated_at: T0,
        status: 'pending',
      });
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

      const updateQuery = mockUpdateChain({
        data: [{ ...mockTask, priority: 'low', updated_at: T1 }],
        error: null,
      });

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(updateQuery),
      };

      const request = patchRequest({
        id: mockTask.id,
        expected_updated_at: T0,
        priority: 'low',
      });
      const response = await PATCH(request);
      const json = await response.json();

      expect(response.status).toBe(422);
      expect(json.error_code).toBe('maintenance_task_response_invalid');
      expect(String(json.message)).toMatch(/validation|invalid/i);
    });

    it('returns 409 and mutates nothing when the version precondition matches zero rows', async () => {
      const updateQuery = mockUpdateChain({ data: [], error: null });
      const existsQuery = mockExistsChain({ id: mockTask.id });

      mockUserSupabase = {
        from: jest
          .fn()
          .mockReturnValueOnce(updateQuery)
          .mockReturnValueOnce(existsQuery),
      };

      const request = patchRequest({
        id: mockTask.id,
        expected_updated_at: T0,
        notes: 'Needs inspection',
      });
      const response = await PATCH(request);
      const json = await response.json();

      expect(response.status).toBe(409);
      expect(json.error_code).toBe('MAINTENANCE_TASK_STALE_VERSION');
      expect(json.success).toBe(false);
      expect(json.data).toBeUndefined();
      expect(updateQuery.eq).toHaveBeenCalledWith('id', mockTask.id);
      expect(updateQuery.eq).toHaveBeenCalledWith('org_id', TEST_ORG_ID);
      expect(updateQuery.eq).toHaveBeenCalledWith('updated_at', T0);
      expect(updateQuery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          notes: 'Needs inspection',
        })
      );
      expect(existsQuery.maybeSingle).toHaveBeenCalled();
    });

    it('returns 404 when a conditional update matches no visible task', async () => {
      const updateQuery = mockUpdateChain({ data: [], error: null });
      const existsQuery = mockExistsChain(null);

      mockUserSupabase = {
        from: jest
          .fn()
          .mockReturnValueOnce(updateQuery)
          .mockReturnValueOnce(existsQuery),
      };

      const request = patchRequest({
        id: mockTask.id,
        expected_updated_at: T0,
        notes: 'Gone',
      });
      const response = await PATCH(request);
      const json = await response.json();

      expect(response.status).toBe(404);
      expect(json.message).toBe('Task not found');
      expect(json.success).toBe(false);
    });

    it('returns 409 for a same-field stale status write after a newer version exists', async () => {
      const statusQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { status: 'in_progress' },
          error: null,
        }),
      };
      const updateQuery = mockUpdateChain({ data: [], error: null });
      const existsQuery = mockExistsChain({ id: mockTask.id });

      mockUserSupabase = {
        from: jest
          .fn()
          .mockReturnValueOnce(statusQuery)
          .mockReturnValueOnce(updateQuery)
          .mockReturnValueOnce(existsQuery),
      };

      const request = patchRequest({
        id: mockTask.id,
        expected_updated_at: T0,
        status: 'in_progress',
      });
      const response = await PATCH(request);
      const json = await response.json();

      expect(response.status).toBe(409);
      expect(json.error_code).toBe('MAINTENANCE_TASK_STALE_VERSION');
      expect(updateQuery.eq).toHaveBeenCalledWith('updated_at', T0);
    });

    it('denies same-org member PATCH (authorization unchanged)', async () => {
      mockAuthContext = { ...mockAuthContext, role: 'member' };

      const request = patchRequest({
        id: mockTask.id,
        expected_updated_at: T0,
        notes: 'Member write',
      });
      const response = await PATCH(request);
      const json = await response.json();

      expect(response.status).toBe(403);
      expect(json.message).toBe('Admin role required');
      expect(mockUserSupabase.from).not.toHaveBeenCalled();
    });

    it('scopes the conditional update to the authenticated org', async () => {
      const otherOrgId = '223e4567-e89b-12d3-a456-426614174099';
      mockAuthContext = { ...mockAuthContext, orgId: otherOrgId };

      const updateQuery = mockUpdateChain({ data: [], error: null });
      const existsQuery = mockExistsChain(null);

      mockUserSupabase = {
        from: jest
          .fn()
          .mockReturnValueOnce(updateQuery)
          .mockReturnValueOnce(existsQuery),
      };

      const request = patchRequest({
        id: mockTask.id,
        expected_updated_at: T0,
        notes: 'Cross-org overwrite',
      });
      const response = await PATCH(request);

      expect(response.status).toBe(404);
      expect(updateQuery.eq).toHaveBeenCalledWith('org_id', otherOrgId);
      expect(existsQuery.eq).toHaveBeenCalledWith('org_id', otherOrgId);
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
