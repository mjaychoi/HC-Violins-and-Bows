import { NextRequest } from 'next/server';
import { GET, POST } from '../route';
import { getServerSupabase } from '@/lib/supabase-server';

jest.mock('@/lib/supabase-server');
jest.mock('@/app/api/_utils/withSentryRoute', () => ({
  withSentryRoute: (fn: unknown) => fn,
}));
jest.mock('@/app/api/_utils/withAuthRoute', () => ({
  withAuthRoute: (handler: (req: unknown, user: unknown) => unknown) => {
    return (req: unknown) => {
      const TEST_USER = { id: 'test-user-id' } as any;
      return handler(req, TEST_USER);
    };
  },
}));

const mockGetServerSupabase = getServerSupabase as jest.MockedFunction<
  typeof getServerSupabase
>;

describe('/api/notification-settings', () => {
  const mockUserId = 'test-user-id'; // matches TEST_USER.id from withAuthRoute mock

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET', () => {
    it('should return existing notification settings', async () => {
      const mockSettings = {
        id: '123e4567-e89b-12d3-a456-426614174001',
        user_id: mockUserId,
        email_notifications: true,
        notification_time: '10:00',
        days_before_due: [5, 3, 1],
        enabled: true,
        last_notification_sent_at: '2024-01-15T09:00:00Z',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-15T09:00:00Z',
      };

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: mockSettings,
          error: null,
        }),
      };

      const mockSupabaseClient = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest(
        'http://localhost/api/notification-settings'
      );
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json).toEqual(mockSettings);
      expect(mockQuery.eq).toHaveBeenCalledWith('user_id', mockUserId);
    });

    it('should return default settings when no settings found', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST116', message: 'Not found' },
        }),
      };

      const mockSupabaseClient = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest(
        'http://localhost/api/notification-settings'
      );
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.user_id).toBe(mockUserId);
      expect(json.email_notifications).toBe(true);
      expect(json.notification_time).toBe('09:00');
      expect(json.days_before_due).toEqual([3, 1]);
      expect(json.enabled).toBe(true);
      expect(json.last_notification_sent_at).toBeNull();
      expect(json.created_at).toBeDefined();
      expect(json.updated_at).toBeDefined();
    });

    it('should return 500 when database error occurs (non-PGRST116)', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST_ERROR', message: 'Database error' },
        }),
      };

      const mockSupabaseClient = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest(
        'http://localhost/api/notification-settings'
      );
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.error).toBeDefined();
      // createSafeErrorResponse sanitizes error messages
    });
  });

  describe('POST', () => {
    it('should create new notification settings', async () => {
      const newSettings = {
        email_notifications: true,
        notification_time: '10:00',
        days_before_due: [5, 3, 1],
        enabled: true,
      };

      const mockCreatedSettings = {
        id: '123e4567-e89b-12d3-a456-426614174001',
        user_id: mockUserId,
        ...newSettings,
        last_notification_sent_at: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      const mockUpsertQuery = {
        upsert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: mockCreatedSettings,
          error: null,
        }),
      };

      const mockSupabaseClient = {
        from: jest.fn().mockReturnValue(mockUpsertQuery),
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest(
        'http://localhost/api/notification-settings',
        {
          method: 'POST',
          body: JSON.stringify(newSettings),
        }
      );
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json).toEqual(mockCreatedSettings);
      expect(mockUpsertQuery.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: mockUserId,
          email_notifications: true,
          notification_time: '10:00',
          days_before_due: [5, 3, 1],
          enabled: true,
        }),
        { onConflict: 'user_id' }
      );
    });

    it('should update existing notification settings', async () => {
      const updatedSettings = {
        email_notifications: false,
        notification_time: '14:30',
        days_before_due: [7, 3],
        enabled: false,
      };

      const mockUpdatedSettings = {
        id: '123e4567-e89b-12d3-a456-426614174001',
        user_id: mockUserId,
        ...updatedSettings,
        last_notification_sent_at: '2024-01-15T09:00:00Z',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-16T00:00:00Z',
      };

      const mockUpsertQuery = {
        upsert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: mockUpdatedSettings,
          error: null,
        }),
      };

      const mockSupabaseClient = {
        from: jest.fn().mockReturnValue(mockUpsertQuery),
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest(
        'http://localhost/api/notification-settings',
        {
          method: 'POST',
          body: JSON.stringify(updatedSettings),
        }
      );
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.email_notifications).toBe(false);
      expect(json.notification_time).toBe('14:30');
      expect(json.days_before_due).toEqual([7, 3]);
      expect(json.enabled).toBe(false);
    });

    it('should use default values when fields are omitted', async () => {
      const partialSettings = {
        notification_time: '12:00',
      };

      const mockCreatedSettings = {
        id: '123e4567-e89b-12d3-a456-426614174001',
        user_id: mockUserId,
        email_notifications: true, // default
        notification_time: '12:00',
        days_before_due: [3, 1], // default
        enabled: true, // default
        last_notification_sent_at: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      const mockUpsertQuery = {
        upsert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: mockCreatedSettings,
          error: null,
        }),
      };

      const mockSupabaseClient = {
        from: jest.fn().mockReturnValue(mockUpsertQuery),
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest(
        'http://localhost/api/notification-settings',
        {
          method: 'POST',
          body: JSON.stringify(partialSettings),
        }
      );
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.email_notifications).toBe(true);
      expect(json.notification_time).toBe('12:00');
      expect(json.days_before_due).toEqual([3, 1]);
      expect(json.enabled).toBe(true);
      expect(mockUpsertQuery.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          email_notifications: true,
          notification_time: '12:00',
          days_before_due: [3, 1],
          enabled: true,
        }),
        { onConflict: 'user_id' }
      );
    });

    it('should return 400 for invalid notification_time format', async () => {
      const invalidSettings = {
        notification_time: '25:00', // Invalid: hour > 23
      };

      const mockSupabaseClient = {
        from: jest.fn(),
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest(
        'http://localhost/api/notification-settings',
        {
          method: 'POST',
          body: JSON.stringify(invalidSettings),
        }
      );
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe('Invalid notification_time format. Use HH:MM');
      expect(mockSupabaseClient.from).not.toHaveBeenCalled();
    });

    it('should return 400 for invalid notification_time format (minutes)', async () => {
      const invalidSettings = {
        notification_time: '12:60', // Invalid: minutes >= 60
      };

      const mockSupabaseClient = {
        from: jest.fn(),
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest(
        'http://localhost/api/notification-settings',
        {
          method: 'POST',
          body: JSON.stringify(invalidSettings),
        }
      );
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe('Invalid notification_time format. Use HH:MM');
    });

    it('should return 400 when days_before_due is not an array', async () => {
      const invalidSettings = {
        days_before_due: 'not an array',
      };

      const mockSupabaseClient = {
        from: jest.fn(),
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest(
        'http://localhost/api/notification-settings',
        {
          method: 'POST',
          body: JSON.stringify(invalidSettings),
        }
      );
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe('days_before_due must be an array');
      expect(mockSupabaseClient.from).not.toHaveBeenCalled();
    });

    it('should accept valid notification_time formats', async () => {
      const validTimeFormats = ['00:00', '09:00', '12:30', '23:59'];

      for (const time of validTimeFormats) {
        const mockUpsertQuery = {
          upsert: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: {
              id: '123e4567-e89b-12d3-a456-426614174001',
              user_id: mockUserId,
              email_notifications: true,
              notification_time: time,
              days_before_due: [3, 1],
              enabled: true,
              created_at: '2024-01-01T00:00:00Z',
              updated_at: '2024-01-01T00:00:00Z',
            },
            error: null,
          }),
        };

        const mockSupabaseClient = {
          from: jest.fn().mockReturnValue(mockUpsertQuery),
        } as any;

        mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

        const request = new NextRequest(
          'http://localhost/api/notification-settings',
          {
            method: 'POST',
            body: JSON.stringify({ notification_time: time }),
          }
        );
        const response = await POST(request);

        expect(response.status).toBe(200);
      }
    });

    it('should return 500 when upsert fails', async () => {
      const newSettings = {
        email_notifications: true,
        notification_time: '10:00',
        days_before_due: [5, 3, 1],
        enabled: true,
      };

      const mockUpsertQuery = {
        upsert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database error' },
        }),
      };

      const mockSupabaseClient = {
        from: jest.fn().mockReturnValue(mockUpsertQuery),
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest(
        'http://localhost/api/notification-settings',
        {
          method: 'POST',
          body: JSON.stringify(newSettings),
        }
      );
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.error).toBeDefined();
      // createSafeErrorResponse sanitizes error messages
    });
  });
});
