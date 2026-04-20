import { NextRequest } from 'next/server';
import { GET, POST, PATCH, DELETE } from '../route';
import { errorHandler } from '@/utils/errorHandler';

jest.mock('@/utils/errorHandler');
jest.mock('@/utils/logger');
jest.mock('@/utils/monitoring');
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
const mockErrorHandler = errorHandler as jest.Mocked<typeof errorHandler>;

// Mock inputValidation
jest.mock('@/utils/inputValidation', () => ({
  validateUUID: jest.fn(value =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value
    )
  ),
  validateDateString: jest.fn(value =>
    typeof value === 'string' ? /^\d{4}-\d{2}-\d{2}$/.test(value) : false
  ),
}));

// Mock dateParsing
jest.mock('@/utils/dateParsing', () => ({
  todayLocalYMD: jest.fn(() => '2024-01-20'),
}));

describe('/api/contacts', () => {
  const mockContactLog = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    client_id: '123e4567-e89b-12d3-a456-426614174001',
    instrument_id: null,
    contact_type: 'email',
    subject: 'Test Subject',
    content: 'Test content',
    contact_date: '2024-01-15',
    next_follow_up_date: null,
    follow_up_completed_at: null,
    purpose: 'inquiry',
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
    client: null,
    instrument: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(performance, 'now').mockReturnValue(0);
    mockUserSupabase = {
      from: jest.fn(),
    };
    mockAuthContext = {
      user: { id: 'test-user' },
      accessToken: 'test-token',
      orgId: 'test-org',
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
    it('should reject requests without org context', async () => {
      mockAuthContext = {
        ...mockAuthContext,
        orgId: null,
      };

      const request = new NextRequest('http://localhost/api/contacts');
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(403);
      expect(json.error).toBe('Organization context required');
      expect(json.success).toBe(false);
      expect(mockUserSupabase.from).not.toHaveBeenCalled();
    });

    it('should return contact logs', async () => {
      // Mock contact_logs query
      const mockContactLogsQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        not: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        range: jest.fn(),
      };
      (mockContactLogsQuery.order as jest.Mock).mockReturnValue(
        mockContactLogsQuery
      );
      (mockContactLogsQuery.range as jest.Mock).mockResolvedValue({
        data: [mockContactLog],
        error: null,
        count: 1,
      });

      // Mock clients query (for batch fetch)
      const mockClientsQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
      };
      (mockClientsQuery.in as jest.Mock).mockResolvedValue({
        data: [],
        error: null,
      });

      // Mock instruments query (for batch fetch)
      const mockInstrumentsQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
      };
      (mockInstrumentsQuery.in as jest.Mock).mockResolvedValue({
        data: [],
        error: null,
      });

      mockUserSupabase = {
        from: jest.fn((table: string) => {
          if (table === 'contact_logs') return mockContactLogsQuery;
          if (table === 'clients') return mockClientsQuery;
          if (table === 'instruments') return mockInstrumentsQuery;
          return mockContactLogsQuery;
        }),
      };

      const request = new NextRequest('http://localhost/api/contacts');
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data).toEqual([
        {
          ...mockContactLog,
          client: null,
          instrument: null,
        },
      ]);
      expect(json.success).toBe(true);
      expect(json.total).toBe(1);
      expect(json.page).toBe(1);
      expect(json.pageSize).toBe(50);
      expect(mockContactLogsQuery.eq).toHaveBeenCalledWith(
        'org_id',
        'test-org'
      );
      expect(mockContactLogsQuery.range).toHaveBeenCalledWith(0, 49);
      expect(mockClientsQuery.eq).toHaveBeenCalledWith('org_id', 'test-org');
    });

    it('should scope related client and instrument fetches to the auth org', async () => {
      const contactWithInstrument = {
        ...mockContactLog,
        instrument_id: '123e4567-e89b-12d3-a456-426614174099',
      };
      const mockContactLogsQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn(),
      };
      (mockContactLogsQuery.order as jest.Mock).mockReturnValue(
        mockContactLogsQuery
      );
      (mockContactLogsQuery.range as jest.Mock).mockResolvedValue({
        data: [contactWithInstrument],
        error: null,
        count: 1,
      });

      const mockClientsQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      };

      const mockInstrumentsQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      };

      mockUserSupabase = {
        from: jest.fn((table: string) => {
          if (table === 'contact_logs') return mockContactLogsQuery;
          if (table === 'clients') return mockClientsQuery;
          if (table === 'instruments') return mockInstrumentsQuery;
          return mockContactLogsQuery;
        }),
      };
      mockAuthContext = { ...mockAuthContext, userSupabase: mockUserSupabase };

      const request = new NextRequest('http://localhost/api/contacts');
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockContactLogsQuery.eq).toHaveBeenCalledWith(
        'org_id',
        'test-org'
      );
      expect(mockClientsQuery.eq).toHaveBeenCalledWith('org_id', 'test-org');
      expect(mockInstrumentsQuery.eq).toHaveBeenCalledWith(
        'org_id',
        'test-org'
      );
    });

    it('should prevent cross-org reads by filtering contact logs with caller org_id', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn(),
      };
      (mockQuery.order as jest.Mock).mockReturnValue(mockQuery);
      (mockQuery.range as jest.Mock).mockResolvedValue({
        data: [],
        error: null,
        count: 0,
      });

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockQuery),
      };
      mockAuthContext = {
        ...mockAuthContext,
        orgId: 'org-xyz',
        userSupabase: mockUserSupabase,
      };

      const request = new NextRequest(
        `http://localhost/api/contacts?clientId=${mockContactLog.client_id}`
      );
      await GET(request);

      expect(mockQuery.eq).toHaveBeenNthCalledWith(1, 'org_id', 'org-xyz');
      expect(mockQuery.eq).toHaveBeenNthCalledWith(
        2,
        'client_id',
        mockContactLog.client_id
      );
    });

    it('should filter by clientId', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn(),
      };
      (mockQuery.order as jest.Mock).mockReturnValue(mockQuery);
      (mockQuery.range as jest.Mock).mockResolvedValue({
        data: [mockContactLog],
        error: null,
        count: 1,
      });

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockQuery),
      };

      const request = new NextRequest(
        `http://localhost/api/contacts?clientId=${mockContactLog.client_id}`
      );
      await GET(request);

      expect(mockQuery.eq).toHaveBeenCalledWith(
        'client_id',
        mockContactLog.client_id
      );
    });

    it('should filter by batch clientIds', async () => {
      const clientIds = [
        '123e4567-e89b-12d3-a456-426614174001',
        '123e4567-e89b-12d3-a456-426614174002',
      ];
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn(),
      };
      (mockQuery.order as jest.Mock).mockReturnValue(mockQuery);
      (mockQuery.range as jest.Mock).mockResolvedValue({
        data: [mockContactLog],
        error: null,
        count: 1,
      });

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockQuery),
      };

      const request = new NextRequest(
        `http://localhost/api/contacts?clientIds=${clientIds.join(',')}`
      );
      await GET(request);

      expect(mockQuery.in).toHaveBeenCalledWith('client_id', clientIds);
    });

    it('should filter by instrumentId', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn(),
      };
      (mockQuery.order as jest.Mock).mockReturnValue(mockQuery);
      (mockQuery.range as jest.Mock).mockResolvedValue({
        data: [mockContactLog],
        error: null,
        count: 1,
      });

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockQuery),
      };

      const instrumentId = '123e4567-e89b-12d3-a456-426614174002';
      const request = new NextRequest(
        `http://localhost/api/contacts?instrumentId=${instrumentId}`
      );
      await GET(request);

      expect(mockQuery.eq).toHaveBeenCalledWith('instrument_id', instrumentId);
    });

    it('should filter by date range', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn(),
      };
      (mockQuery.order as jest.Mock).mockReturnValue(mockQuery);
      (mockQuery.range as jest.Mock).mockResolvedValue({
        data: [mockContactLog],
        error: null,
        count: 1,
      });

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockQuery),
      };

      const request = new NextRequest(
        'http://localhost/api/contacts?fromDate=2024-01-01&toDate=2024-01-31'
      );
      await GET(request);

      expect(mockQuery.gte).toHaveBeenCalledWith('contact_date', '2024-01-01');
      expect(mockQuery.lte).toHaveBeenCalledWith('contact_date', '2024-01-31');
    });

    it('should return 400 for invalid date filters', async () => {
      const { validateDateString } = require('@/utils/inputValidation');
      (validateDateString as jest.Mock).mockReturnValueOnce(false);

      const request = new NextRequest(
        'http://localhost/api/contacts?fromDate=bad-date'
      );
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe('Invalid fromDate format');
      expect(mockUserSupabase.from).not.toHaveBeenCalled();
    });

    it('should reject clientIds lists larger than 50', async () => {
      const { validateUUID } = require('@/utils/inputValidation');
      (validateUUID as jest.Mock).mockImplementation(() => true);

      const clientIds = Array.from(
        { length: 51 },
        () => mockContactLog.client_id
      );

      const request = new NextRequest(
        `http://localhost/api/contacts?clientIds=${clientIds.join(',')}`
      );
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe('clientIds cannot exceed 50 IDs');
      expect(mockUserSupabase.from).not.toHaveBeenCalled();
    });

    it('should apply pagination to contact log queries', async () => {
      const paginatedContact = {
        ...mockContactLog,
        client_id: null,
        instrument_id: null,
      };
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn(),
      };
      (mockQuery.order as jest.Mock).mockReturnValue(mockQuery);
      (mockQuery.range as jest.Mock).mockResolvedValue({
        data: [paginatedContact],
        error: null,
        count: 120,
      });

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockQuery),
      };

      const request = new NextRequest(
        'http://localhost/api/contacts?page=2&pageSize=25'
      );
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.page).toBe(2);
      expect(json.pageSize).toBe(25);
      expect(json.total).toBe(120);
      expect(mockQuery.range).toHaveBeenCalledWith(25, 49);
    });

    it('should filter by followUpDue', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        not: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn(),
      };
      (mockQuery.order as jest.Mock)
        .mockReturnValueOnce(mockQuery)
        .mockReturnValueOnce(mockQuery);
      (mockQuery.range as jest.Mock).mockResolvedValue({
        data: [mockContactLog],
        error: null,
        count: 1,
      });

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockQuery),
      };

      const request = new NextRequest(
        'http://localhost/api/contacts?followUpDue=true'
      );
      await GET(request);

      expect(mockQuery.not).toHaveBeenCalledWith(
        'next_follow_up_date',
        'is',
        null
      );
      expect(mockQuery.lte).toHaveBeenCalledWith(
        'next_follow_up_date',
        '2024-01-20'
      );
      expect(mockQuery.is).toHaveBeenCalledWith('follow_up_completed_at', null);
    });
  });

  describe('POST', () => {
    it('should reject POST without org context', async () => {
      mockAuthContext = {
        ...mockAuthContext,
        orgId: null,
      };

      const request = new NextRequest('http://localhost/api/contacts', {
        method: 'POST',
        headers: {
          'Idempotency-Key': 'test-contacts-post-1',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: mockContactLog.client_id,
          contact_type: 'email',
          content: 'Test',
          contact_date: '2024-01-15',
        }),
      });
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(403);
      expect(json.error).toBe('Organization context required');
      expect(json.success).toBe(false);
      expect(mockUserSupabase.from).not.toHaveBeenCalled();
    });

    it('should create a new contact log', async () => {
      const createData = {
        client_id: mockContactLog.client_id,
        instrument_id: null,
        contact_type: 'email',
        subject: 'Test Subject',
        content: 'Test content',
        contact_date: '2024-01-15',
        next_follow_up_date: null,
        purpose: 'inquiry',
      };

      const mockClientQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: { id: mockContactLog.client_id },
          error: null,
        }),
      };
      const mockInstrumentQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: { id: '123e4567-e89b-12d3-a456-426614174002' },
          error: null,
        }),
      };
      const mockInsertQuery = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn(),
      };
      (mockInsertQuery.single as jest.Mock).mockResolvedValue({
        data: mockContactLog,
        error: null,
      });

      mockUserSupabase = {
        from: jest.fn((table: string) => {
          if (table === 'clients') return mockClientQuery;
          if (table === 'instruments') return mockInstrumentQuery;
          return mockInsertQuery;
        }),
      };

      const request = new NextRequest('http://localhost/api/contacts', {
        method: 'POST',
        headers: {
          'Idempotency-Key': 'test-contacts-post-2',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(createData),
      });
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(201);
      expect(json.data).toBeDefined();
      expect(json.success).toBe(true);
      expect(mockClientQuery.eq).toHaveBeenNthCalledWith(
        1,
        'id',
        mockContactLog.client_id
      );
      expect(mockClientQuery.eq).toHaveBeenNthCalledWith(
        2,
        'org_id',
        'test-org'
      );
      expect(mockInsertQuery.insert).toHaveBeenCalled();
    });

    it('should reject instrument_id outside caller org', async () => {
      const instrumentId = '123e4567-e89b-12d3-a456-426614174002';
      const mockClientQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: { id: mockContactLog.client_id },
          error: null,
        }),
      };
      const mockInstrumentQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      };
      const mockInsertQuery = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn(),
      };

      mockUserSupabase = {
        from: jest.fn((table: string) => {
          if (table === 'clients') return mockClientQuery;
          if (table === 'instruments') return mockInstrumentQuery;
          return mockInsertQuery;
        }),
      };

      const request = new NextRequest('http://localhost/api/contacts', {
        method: 'POST',
        headers: {
          'Idempotency-Key': 'test-contacts-post-3',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: mockContactLog.client_id,
          instrument_id: instrumentId,
          contact_type: 'email',
          content: 'Test content',
          contact_date: '2024-01-15',
        }),
      });
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe('Instrument not found in organization');
      expect(json.success).toBe(false);
      expect(mockInstrumentQuery.eq).toHaveBeenNthCalledWith(
        1,
        'id',
        instrumentId
      );
      expect(mockInstrumentQuery.eq).toHaveBeenNthCalledWith(
        2,
        'org_id',
        'test-org'
      );
      expect(mockInsertQuery.insert).not.toHaveBeenCalled();
    });

    it('should allow valid in-org instrument_id', async () => {
      const instrumentId = '123e4567-e89b-12d3-a456-426614174002';
      const mockClientQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: { id: mockContactLog.client_id },
          error: null,
        }),
      };
      const mockInstrumentQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: { id: instrumentId },
          error: null,
        }),
      };
      const mockInsertQuery = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { ...mockContactLog, instrument_id: instrumentId },
          error: null,
        }),
      };

      mockUserSupabase = {
        from: jest.fn((table: string) => {
          if (table === 'clients') return mockClientQuery;
          if (table === 'instruments') return mockInstrumentQuery;
          return mockInsertQuery;
        }),
      };

      const request = new NextRequest('http://localhost/api/contacts', {
        method: 'POST',
        headers: {
          'Idempotency-Key': 'test-contacts-post-4',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: mockContactLog.client_id,
          instrument_id: instrumentId,
          contact_type: 'email',
          content: 'Test content',
          contact_date: '2024-01-15',
        }),
      });
      const response = await POST(request);

      expect(response.status).toBe(201);
      expect(mockInsertQuery.insert).toHaveBeenCalledWith(
        expect.objectContaining({ instrument_id: instrumentId })
      );
    });

    it('should reject client_id outside caller org', async () => {
      const mockClientQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      };
      const mockInsertQuery = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn(),
      };

      mockUserSupabase = {
        from: jest.fn((table: string) => {
          if (table === 'clients') return mockClientQuery;
          return mockInsertQuery;
        }),
      };

      const request = new NextRequest('http://localhost/api/contacts', {
        method: 'POST',
        headers: {
          'Idempotency-Key': 'test-contacts-post-5',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: mockContactLog.client_id,
          contact_type: 'email',
          content: 'Test content',
          contact_date: '2024-01-15',
        }),
      });
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe('Client not found in organization');
      expect(json.success).toBe(false);
      expect(mockInsertQuery.insert).not.toHaveBeenCalled();
    });

    it('should return 400 when client_id is missing', async () => {
      const request = new NextRequest('http://localhost/api/contacts', {
        method: 'POST',
        headers: {
          'Idempotency-Key': 'test-contacts-post-6',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contact_type: 'email',
          content: 'Test',
          contact_date: '2024-01-15',
        }),
      });
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toContain('Valid client_id is required');
    });

    it('should return 400 when contact_type is invalid', async () => {
      const request = new NextRequest('http://localhost/api/contacts', {
        method: 'POST',
        headers: {
          'Idempotency-Key': 'test-contacts-post-7',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: mockContactLog.client_id,
          contact_type: 'invalid',
          content: 'Test',
          contact_date: '2024-01-15',
        }),
      });
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toContain('Valid contact_type is required');
    });

    it('should return 400 when content is missing', async () => {
      const request = new NextRequest('http://localhost/api/contacts', {
        method: 'POST',
        headers: {
          'Idempotency-Key': 'test-contacts-post-8',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: mockContactLog.client_id,
          contact_type: 'email',
          contact_date: '2024-01-15',
        }),
      });
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe('Content is required');
    });
  });

  describe('PATCH', () => {
    it('should update an existing contact log', async () => {
      const updates = {
        subject: 'Updated Subject',
        content: 'Updated content',
      };
      const updatedContact = { ...mockContactLog, ...updates };

      const mockQuery = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn(),
      };
      (mockQuery.single as jest.Mock).mockResolvedValue({
        data: updatedContact,
        error: null,
      });

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockQuery),
      };

      const request = new NextRequest('http://localhost/api/contacts', {
        method: 'PATCH',
        body: JSON.stringify({ id: mockContactLog.id, ...updates }),
      });
      const response = await PATCH(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data).toBeDefined();
      expect(json.success).toBe(true);
      expect(mockQuery.eq).toHaveBeenCalledWith('id', mockContactLog.id);
      expect(mockQuery.eq).toHaveBeenCalledWith('org_id', 'test-org');
      expect(mockQuery.update).toHaveBeenCalled();
    });

    it('should return 400 when id is missing', async () => {
      const request = new NextRequest('http://localhost/api/contacts', {
        method: 'PATCH',
        body: JSON.stringify({ subject: 'Updated' }),
      });
      const response = await PATCH(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toContain('Valid id is required');
    });

    it('should trim content when updating', async () => {
      const mockQuery = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn(),
      };
      (mockQuery.single as jest.Mock).mockResolvedValue({
        data: mockContactLog,
        error: null,
      });

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockQuery),
      };

      const request = new NextRequest('http://localhost/api/contacts', {
        method: 'PATCH',
        body: JSON.stringify({
          id: mockContactLog.id,
          content: '  Test content with spaces  ',
        }),
      });
      await PATCH(request);

      expect(mockQuery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'Test content with spaces',
        })
      );
    });

    it('should reject invalid contact_date on patch', async () => {
      const { validateDateString } = require('@/utils/inputValidation');
      (validateDateString as jest.Mock).mockReturnValueOnce(false);

      const request = new NextRequest('http://localhost/api/contacts', {
        method: 'PATCH',
        body: JSON.stringify({
          id: mockContactLog.id,
          contact_date: 'bad-date',
        }),
      });
      const response = await PATCH(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe('Invalid contact_date format');
      expect(mockUserSupabase.from).not.toHaveBeenCalled();
    });

    it('should reject invalid next_follow_up_date on patch', async () => {
      const { validateDateString } = require('@/utils/inputValidation');
      (validateDateString as jest.Mock)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);

      const request = new NextRequest('http://localhost/api/contacts', {
        method: 'PATCH',
        body: JSON.stringify({
          id: mockContactLog.id,
          contact_date: '2024-01-15',
          next_follow_up_date: 'bad-date',
        }),
      });
      const response = await PATCH(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe('Invalid next_follow_up_date format');
      expect(mockUserSupabase.from).not.toHaveBeenCalled();
    });
  });

  describe('DELETE', () => {
    it('should delete a contact log', async () => {
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
        `http://localhost/api/contacts?id=${mockContactLog.id}`
      );
      const response = await DELETE(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(mockQuery.eq).toHaveBeenCalledWith('id', mockContactLog.id);
      expect(mockQuery.eq).toHaveBeenCalledWith('org_id', 'test-org');
      expect(mockQuery.delete).toHaveBeenCalled();
    });

    it('should return 400 when id is missing', async () => {
      const request = new NextRequest('http://localhost/api/contacts');
      const response = await DELETE(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toContain('Valid id is required');
    });

    it('should return 400 for invalid UUID', async () => {
      const { validateUUID } = require('@/utils/inputValidation');
      (validateUUID as jest.Mock).mockReturnValueOnce(false);

      const request = new NextRequest(
        'http://localhost/api/contacts?id=invalid'
      );
      const response = await DELETE(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toContain('Valid id is required');
    });

    it('should handle Supabase errors on delete', async () => {
      const mockError = { message: 'Database error', code: 'PGRST116' };
      const mockQuery = {
        delete: jest.fn().mockReturnThis(),
        error: mockError,
        eq: jest.fn().mockReturnThis(),
      };

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockQuery),
      };
      mockErrorHandler.handleSupabaseError = jest.fn().mockReturnValue({
        code: 'PGRST116',
        message: 'Database error',
      });

      const request = new NextRequest(
        `http://localhost/api/contacts?id=${mockContactLog.id}`
      );
      const response = await DELETE(request);

      expect(response.status).toBe(500);
      expect(mockErrorHandler.handleSupabaseError).toHaveBeenCalled();
    });
  });
});
