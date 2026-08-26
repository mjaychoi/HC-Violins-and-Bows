import { NextRequest } from 'next/server';
import { GET, POST } from '../route';

let mockUserSupabase: any;
let mockOrgId: string | null = 'test-org';

jest.mock('@/app/api/_utils/withSentryRoute', () => ({
  withSentryRoute: (fn: unknown) => fn,
}));
jest.mock('@/app/api/_utils/withAuthRoute', () => {
  const actual = jest.requireActual('@/app/api/_utils/withAuthRoute');
  return {
    ...actual,
    withAuthRoute: (handler: (req: unknown, auth: unknown) => unknown) => {
      return (req: unknown) => {
        return handler(req, {
          user: { id: 'test-user-id' },
          accessToken: 'test-token',
          orgId: mockOrgId,
          clientId: 'test-client',
          role: 'admin',
          userSupabase: mockUserSupabase,
          isTestBypass: true,
        });
      };
    },
  };
});

const SECRET_LEAK_PATTERNS = [
  'RESEND_API_KEY',
  'SEND_NOTIFICATIONS_SECRET',
  'SUPABASE_SERVICE_ROLE_KEY',
  'x-send-notifications-secret',
  're_',
];

function assertUnsupportedDeliveryMetadata(json: {
  metadata?: { notificationDeliverySupported?: boolean };
}) {
  expect(json.metadata).toEqual({
    notificationDeliverySupported: false,
  });
}

function assertNoSecretOrConfigLeak(json: unknown) {
  const serialized = JSON.stringify(json);
  for (const pattern of SECRET_LEAK_PATTERNS) {
    expect(serialized).not.toContain(pattern);
  }
}

describe('/api/notification-settings', () => {
  const mockUserId = 'test-user-id';

  beforeEach(() => {
    jest.clearAllMocks();
    mockOrgId = 'test-org';
    mockUserSupabase = { from: jest.fn() };
  });

  describe('GET', () => {
    it('should return existing notification settings with effective delivery disabled', async () => {
      const mockSettings = {
        id: '123e4567-e89b-12d3-a456-426614174001',
        org_id: 'test-org',
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

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      const request = new NextRequest(
        'http://localhost/api/notification-settings'
      );
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data).toEqual({
        ...mockSettings,
        email_notifications: false,
        enabled: false,
      });
      assertUnsupportedDeliveryMetadata(json);
      expect(mockUserSupabase.from).toHaveBeenCalledWith(
        'notification_settings'
      );
      expect(mockQuery.eq).toHaveBeenCalledWith('user_id', mockUserId);
      expect(mockQuery.eq).toHaveBeenCalledWith('org_id', 'test-org');
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

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      const request = new NextRequest(
        'http://localhost/api/notification-settings'
      );
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data.org_id).toBe('test-org');
      expect(json.data.user_id).toBe(mockUserId);
      expect(json.data.email_notifications).toBe(false);
      expect(json.data.notification_time).toBe('09:00');
      expect(json.data.days_before_due).toEqual([3, 1]);
      expect(json.data.enabled).toBe(false);
      expect(json.data.last_notification_sent_at).toBeNull();
      expect(json.data.created_at).toBeDefined();
      expect(json.data.updated_at).toBeDefined();
      assertUnsupportedDeliveryMetadata(json);
    });

    it('should not expose enabled notifications when stored values are true', async () => {
      const mockSettings = {
        id: '123e4567-e89b-12d3-a456-426614174001',
        org_id: 'test-org',
        user_id: mockUserId,
        email_notifications: true,
        notification_time: '10:00',
        days_before_due: [5, 3, 1],
        enabled: true,
        last_notification_sent_at: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: mockSettings,
          error: null,
        }),
      };

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      const request = new NextRequest(
        'http://localhost/api/notification-settings'
      );
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data.notification_time).toBe('10:00');
      expect(json.data.days_before_due).toEqual([5, 3, 1]);
      expect(json.data.email_notifications).toBe(false);
      expect(json.data.enabled).toBe(false);
      assertUnsupportedDeliveryMetadata(json);
    });

    it('should return 403 when organization context is missing', async () => {
      mockOrgId = null;
      mockUserSupabase = {
        from: jest.fn(),
      } as any;

      const request = new NextRequest(
        'http://localhost/api/notification-settings'
      );
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(403);
      expect(json.success).toBe(false);
      expect(json.error).toBe('Organization context required');
      expect(mockUserSupabase.from).not.toHaveBeenCalled();
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

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      const request = new NextRequest(
        'http://localhost/api/notification-settings'
      );
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.message).toBeDefined();
      assertNoSecretOrConfigLeak(json);
    });
  });

  describe('POST', () => {
    it('should create disabled notification settings', async () => {
      const newSettings = {
        email_notifications: false,
        notification_time: '10:00',
        days_before_due: [5, 3, 1],
        enabled: false,
      };

      const mockCreatedSettings = {
        id: '123e4567-e89b-12d3-a456-426614174001',
        org_id: 'test-org',
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

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockUpsertQuery),
      } as any;

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
      expect(json.data).toEqual(mockCreatedSettings);
      assertUnsupportedDeliveryMetadata(json);
      expect(mockUpsertQuery.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          org_id: 'test-org',
          user_id: mockUserId,
          email_notifications: false,
          notification_time: '10:00',
          days_before_due: [5, 3, 1],
          enabled: false,
        }),
        { onConflict: 'org_id,user_id' }
      );
    });

    it('should update existing notification settings while keeping delivery disabled', async () => {
      const updatedSettings = {
        email_notifications: false,
        notification_time: '14:30',
        days_before_due: [7, 3],
        enabled: false,
      };

      const mockUpdatedSettings = {
        id: '123e4567-e89b-12d3-a456-426614174001',
        org_id: 'test-org',
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

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockUpsertQuery),
      } as any;

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
      expect(json.data.email_notifications).toBe(false);
      expect(json.data.notification_time).toBe('14:30');
      expect(json.data.days_before_due).toEqual([7, 3]);
      expect(json.data.enabled).toBe(false);
      assertUnsupportedDeliveryMetadata(json);
      expect(mockUpsertQuery.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          org_id: 'test-org',
          user_id: mockUserId,
        }),
        { onConflict: 'org_id,user_id' }
      );
    });

    it('should use disabled defaults when fields are omitted', async () => {
      const partialSettings = {
        notification_time: '12:00',
      };

      const mockCreatedSettings = {
        id: '123e4567-e89b-12d3-a456-426614174001',
        org_id: 'test-org',
        user_id: mockUserId,
        email_notifications: false,
        notification_time: '12:00',
        days_before_due: [3, 1],
        enabled: false,
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

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockUpsertQuery),
      } as any;

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
      expect(json.data.email_notifications).toBe(false);
      expect(json.data.notification_time).toBe('12:00');
      expect(json.data.days_before_due).toEqual([3, 1]);
      expect(json.data.enabled).toBe(false);
      assertUnsupportedDeliveryMetadata(json);
      expect(mockUpsertQuery.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          org_id: 'test-org',
          email_notifications: false,
          notification_time: '12:00',
          days_before_due: [3, 1],
          enabled: false,
        }),
        { onConflict: 'org_id,user_id' }
      );
    });

    it.each([
      { email_notifications: true },
      { enabled: true },
      { email_notifications: true, enabled: true },
    ])(
      'should reject enabling delivery with 409 and not mutate settings (%j)',
      async body => {
        mockUserSupabase = {
          from: jest.fn(),
        } as any;

        const request = new NextRequest(
          'http://localhost/api/notification-settings',
          {
            method: 'POST',
            body: JSON.stringify(body),
          }
        );
        const response = await POST(request);
        const json = await response.json();

        expect(response.status).toBe(409);
        expect(json.success).toBe(false);
        expect(json.error).toBe(
          'Email notification delivery is not supported in this release'
        );
        expect(json.error_code).toBe('NOTIFICATION_DELIVERY_UNSUPPORTED');
        expect(json.retryable).toBe(false);
        expect(mockUserSupabase.from).not.toHaveBeenCalled();
        assertNoSecretOrConfigLeak(json);
      }
    );

    it('should return 400 for invalid JSON', async () => {
      mockUserSupabase = {
        from: jest.fn(),
      } as any;

      const request = new NextRequest(
        'http://localhost/api/notification-settings',
        {
          method: 'POST',
          body: 'not-json',
          headers: { 'Content-Type': 'application/json' },
        }
      );
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toBe('Invalid JSON body');
      expect(mockUserSupabase.from).not.toHaveBeenCalled();
    });

    it('should return 400 for invalid notification_time format', async () => {
      const invalidSettings = {
        notification_time: '25:00',
      };

      mockUserSupabase = {
        from: jest.fn(),
      } as any;

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
      expect(json.message).toBe('Invalid notification_time format. Use HH:MM');
      expect(mockUserSupabase.from).not.toHaveBeenCalled();
    });

    it('should return 400 for invalid notification_time format (minutes)', async () => {
      const invalidSettings = {
        notification_time: '12:60',
      };

      mockUserSupabase = {
        from: jest.fn(),
      } as any;

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
      expect(json.message).toBe('Invalid notification_time format. Use HH:MM');
    });

    it('should return 400 when days_before_due is not an array', async () => {
      const invalidSettings = {
        days_before_due: 'not an array',
      };

      mockUserSupabase = {
        from: jest.fn(),
      } as any;

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
      expect(json.message).toBe('days_before_due must be an array');
      expect(mockUserSupabase.from).not.toHaveBeenCalled();
    });

    it('should return 400 when email_notifications is not a boolean', async () => {
      mockUserSupabase = {
        from: jest.fn(),
      } as any;

      const request = new NextRequest(
        'http://localhost/api/notification-settings',
        {
          method: 'POST',
          body: JSON.stringify({ email_notifications: 'yes' }),
        }
      );
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe('email_notifications must be a boolean');
      expect(mockUserSupabase.from).not.toHaveBeenCalled();
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
              org_id: 'test-org',
              user_id: mockUserId,
              email_notifications: false,
              notification_time: time,
              days_before_due: [3, 1],
              enabled: false,
              created_at: '2024-01-01T00:00:00Z',
              updated_at: '2024-01-01T00:00:00Z',
            },
            error: null,
          }),
        };

        mockUserSupabase = {
          from: jest.fn().mockReturnValue(mockUpsertQuery),
        } as any;

        const request = new NextRequest(
          'http://localhost/api/notification-settings',
          {
            method: 'POST',
            body: JSON.stringify({
              notification_time: time,
              email_notifications: false,
              enabled: false,
            }),
          }
        );
        const response = await POST(request);
        const json = await response.json();

        expect(response.status).toBe(200);
        assertUnsupportedDeliveryMetadata(json);
      }
    });

    it('should return 403 when organization context is missing', async () => {
      mockOrgId = null;
      mockUserSupabase = {
        from: jest.fn(),
      } as any;

      const request = new NextRequest(
        'http://localhost/api/notification-settings',
        {
          method: 'POST',
          body: JSON.stringify({ email_notifications: false }),
        }
      );
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(403);
      expect(json.success).toBe(false);
      expect(json.error).toBe('Organization context required');
      expect(mockUserSupabase.from).not.toHaveBeenCalled();
    });

    it('should return 500 when upsert fails', async () => {
      const newSettings = {
        email_notifications: false,
        notification_time: '10:00',
        days_before_due: [5, 3, 1],
        enabled: false,
      };

      const mockUpsertQuery = {
        upsert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database error' },
        }),
      };

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockUpsertQuery),
      } as any;

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
      expect(json.message).toBeDefined();
      assertNoSecretOrConfigLeak(json);
    });
  });
});
