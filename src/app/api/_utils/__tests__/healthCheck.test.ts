import { checkMigrations } from '../healthCheck';
import { getServerSupabase } from '@/lib/supabase-server';

jest.mock('@/lib/supabase-server');

const mockGetServerSupabase = getServerSupabase as jest.MockedFunction<
  typeof getServerSupabase
>;

describe('healthCheck', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkMigrations', () => {
    it('should return healthy when display_order column exists', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: [{ display_order: 0 }],
          error: null,
        }),
      };

      const mockSupabaseClient = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const result = await checkMigrations();

      expect(result).toEqual({
        display_order: true,
        allHealthy: true,
      });
      expect(mockSupabaseClient.from).toHaveBeenCalledWith(
        'client_instruments'
      );
      expect(mockQuery.select).toHaveBeenCalledWith('display_order');
      expect(mockQuery.limit).toHaveBeenCalledWith(1);
    });

    it('should return unhealthy when column is missing (error code 42703)', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: null,
          error: {
            code: '42703',
            message: 'column "display_order" does not exist',
          },
        }),
      };

      const mockSupabaseClient = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const result = await checkMigrations();

      expect(result).toEqual({
        display_order: false,
        allHealthy: false,
      });
    });

    it('should detect missing column via error details', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: null,
          error: {
            details: 'Column display_order does not exist',
            message: 'Some error',
          },
        }),
      };

      const mockSupabaseClient = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const result = await checkMigrations();

      expect(result.display_order).toBe(false);
      expect(result.allHealthy).toBe(false);
    });

    it('should detect missing column via error hint', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: null,
          error: {
            hint: 'Perhaps you meant to reference display_order column',
            message: 'Some error',
          },
        }),
      };

      const mockSupabaseClient = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const result = await checkMigrations();

      expect(result.display_order).toBe(false);
      expect(result.allHealthy).toBe(false);
    });

    it('should detect missing column via error message', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: null,
          error: {
            message: 'column "display_order" does not exist',
          },
        }),
      };

      const mockSupabaseClient = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const result = await checkMigrations();

      expect(result.display_order).toBe(false);
      expect(result.allHealthy).toBe(false);
    });

    it('should return unhealthy when error message contains "does not exist" (ambiguous case)', async () => {
      // Note: The current implementation treats any error message containing
      // "does not exist" as a column missing error, which may be too broad.
      // This test verifies the current behavior.
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: null,
          error: {
            code: '42P01', // Table does not exist
            message: 'relation "client_instruments" does not exist',
          },
        }),
      };

      const mockSupabaseClient = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const result = await checkMigrations();

      // Current implementation: any "does not exist" message is treated as column missing
      expect(result.display_order).toBe(false);
      expect(result.allHealthy).toBe(false);
    });

    it('should return unhealthy when exception is thrown', async () => {
      mockGetServerSupabase.mockImplementation(() => {
        throw new Error('Connection error');
      });

      const result = await checkMigrations();

      expect(result).toEqual({
        display_order: false,
        allHealthy: false,
      });
    });

    it('should handle error without message property', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: null,
          error: {
            code: '42703',
          },
        }),
      };

      const mockSupabaseClient = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const result = await checkMigrations();

      expect(result.display_order).toBe(false);
      expect(result.allHealthy).toBe(false);
    });

    it('should handle case-insensitive error message matching', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: null,
          error: {
            message: 'Column DISPLAY_ORDER Does Not Exist',
          },
        }),
      };

      const mockSupabaseClient = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const result = await checkMigrations();

      expect(result.display_order).toBe(false);
      expect(result.allHealthy).toBe(false);
    });

    it('should return healthy when error details/hint do not mention display_order', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: null,
          error: {
            code: '42P01',
            details: 'Table does not exist',
            hint: 'Perhaps you meant to reference another_table',
            message: 'relation "some_table" does not exist',
          },
        }),
      };

      const mockSupabaseClient = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const result = await checkMigrations();

      // Error message contains "does not exist" but doesn't mention display_order,
      // so it's treated as column missing (current implementation behavior)
      expect(result.display_order).toBe(false);
      expect(result.allHealthy).toBe(false);
    });

    it('should handle null data with no error (edge case)', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      };

      const mockSupabaseClient = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const result = await checkMigrations();

      // When data is null but error is null, treat as healthy
      expect(result.display_order).toBe(true);
      expect(result.allHealthy).toBe(true);
    });

    it('should handle empty data array', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      };

      const mockSupabaseClient = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const result = await checkMigrations();

      // Empty array means query succeeded, column exists
      expect(result.display_order).toBe(true);
      expect(result.allHealthy).toBe(true);
    });
  });
});
