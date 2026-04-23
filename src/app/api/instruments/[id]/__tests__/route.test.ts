import { NextRequest } from 'next/server';
import { PATCH } from '../route';
import { errorHandler } from '@/utils/errorHandler';
import {
  INSTRUMENT_PATCH_UPDATED_AT_REQUIRED_CODE,
  resetInstrumentApiContractCacheForTests,
} from '@/app/api/instruments/_shared/instrumentApiContract';

jest.mock('@/utils/errorHandler');
jest.mock('@/utils/logger', () => {
  const actual =
    jest.requireActual<typeof import('@/utils/logger')>('@/utils/logger');
  return {
    ...actual,
    logInfo: jest.fn(),
    logError: jest.fn(),
    logWarn: jest.fn(),
    logDebug: jest.fn(),
    logPerformance: jest.fn(),
    logApiRequest: jest.fn(),
  };
});

const mockErrorHandler = errorHandler as jest.Mocked<typeof errorHandler>;
let mockUserSupabase: any;
let mockAuthContext: any;

jest.mock('@/app/api/_utils/withAuthRoute', () => {
  const actual = jest.requireActual('@/app/api/_utils/withAuthRoute');
  return {
    ...actual,
    withAuthRoute: (handler: any) => (request: NextRequest) =>
      handler(request, {
        ...mockAuthContext,
        userSupabase: mockUserSupabase,
      }),
  };
});

jest.mock('@/utils/typeGuards', () => {
  const actual = jest.requireActual('@/utils/typeGuards');
  return {
    ...actual,
    safeValidate: jest.fn(data => ({
      success: true,
      data,
    })),
    validatePartialInstrument: jest.fn(data => data),
    validateInstrument: jest.fn(data => data),
  };
});

jest.mock('@/utils/inputValidation', () => ({
  validateUUID: jest.fn(value =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value
    )
  ),
}));

describe('/api/instruments/[id]', () => {
  const instrumentId = '123e4567-e89b-12d3-a456-426614174000';
  const updatedAt = '2024-01-02T00:00:00Z';

  beforeEach(() => {
    jest.clearAllMocks();
    resetInstrumentApiContractCacheForTests();
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
    mockErrorHandler.handleSupabaseError = jest
      .fn()
      .mockImplementation((error: { message?: string } | null | undefined) => {
        return new Error(error?.message || 'Database error');
      });
  });

  it('rejects missing org context before instrument reads', async () => {
    mockAuthContext.orgId = null;

    const request = new NextRequest(
      `http://localhost/api/instruments/${instrumentId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status: 'Reserved', reserved_reason: 'Hold' }),
      }
    );

    const response = await PATCH(request, {
      params: Promise.resolve({ id: instrumentId }),
    });
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.message).toBe('Organization context required');
    expect(mockUserSupabase.from).not.toHaveBeenCalled();
  });

  it('matches collection PATCH when updated_at is missing (stable error_code)', async () => {
    const request = new NextRequest(
      `http://localhost/api/instruments/${instrumentId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ note: 'x' }),
      }
    );

    const response = await PATCH(request, {
      params: Promise.resolve({ id: instrumentId }),
    });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(String(json.message || json.error)).toContain('updated_at');
    expect(json.error_code).toBe(INSTRUMENT_PATCH_UPDATED_AT_REQUIRED_CODE);
    expect(mockUserSupabase.from).not.toHaveBeenCalled();
  });

  it('applies org_id filter to both state read and update for same-org patch', async () => {
    const stateQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          status: 'Reserved',
          reserved_reason: 'Current hold',
          reserved_by_user_id: 'test-user',
          reserved_connection_id: null,
        },
        error: null,
      }),
    };

    const updateQuery = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockResolvedValue({
        data: [
          {
            id: instrumentId,
            note: 'Updated note',
            status: 'Reserved',
            org_id: 'test-org',
          },
        ],
        error: null,
      }),
    };

    let instrumentCallCount = 0;
    mockUserSupabase = {
      from: jest.fn((table: string) => {
        if (table !== 'instruments') {
          throw new Error(`Unexpected table: ${table}`);
        }
        instrumentCallCount += 1;
        return instrumentCallCount === 1 ? stateQuery : updateQuery;
      }),
    };

    const request = new NextRequest(
      `http://localhost/api/instruments/${instrumentId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          note: 'Updated note',
          reserved_reason: 'Hold',
          updated_at: updatedAt,
        }),
      }
    );

    const response = await PATCH(request, {
      params: Promise.resolve({ id: instrumentId }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.note).toBe('Updated note');
    expect(stateQuery.eq).toHaveBeenCalledWith('id', instrumentId);
    expect(stateQuery.eq).toHaveBeenCalledWith('org_id', 'test-org');
    expect(updateQuery.eq).toHaveBeenCalledWith('id', instrumentId);
    expect(updateQuery.eq).toHaveBeenCalledWith('org_id', 'test-org');
    expect(updateQuery.eq).toHaveBeenCalledWith('updated_at', updatedAt);
  });

  it('fails closed when the instrument is outside the caller org', async () => {
    const stateQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'Instrument not found' },
      }),
    };

    const updateQuery = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn(),
    };

    let instrumentCallCount = 0;
    mockUserSupabase = {
      from: jest.fn((table: string) => {
        if (table !== 'instruments') {
          throw new Error(`Unexpected table: ${table}`);
        }
        instrumentCallCount += 1;
        return instrumentCallCount === 1 ? stateQuery : updateQuery;
      }),
    };

    const request = new NextRequest(
      `http://localhost/api/instruments/${instrumentId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'Reserved',
          reserved_reason: 'Hold',
          updated_at: updatedAt,
        }),
      }
    );

    const response = await PATCH(request, {
      params: Promise.resolve({ id: instrumentId }),
    });
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.message).toBe('Server error occurred. Please try again later.');
    expect(stateQuery.eq).toHaveBeenCalledWith('org_id', 'test-org');
    expect(updateQuery.update).not.toHaveBeenCalled();
  });
});
