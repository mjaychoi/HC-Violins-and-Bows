import { renderHook, act } from '@/test-utils/render';
import { useContactLogs } from '../useContactLogs';
import { apiFetch } from '@/utils/apiFetch';

jest.mock('@/utils/apiFetch', () => ({
  apiFetch: jest.fn(),
}));

const mockHandleError = jest.fn();
jest.mock('@/contexts/ToastContext', () => {
  const actual = jest.requireActual('@/contexts/ToastContext');
  return {
    __esModule: true,
    ...actual,
    useErrorHandler: () => ({
      handleError: mockHandleError,
    }),
  };
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('useContactLogs contact create idempotency', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (apiFetch as jest.Mock).mockResolvedValue(
      jsonResponse({
        data: {
          id: 'contact-1',
          client_id: 'client-1',
          instrument_id: null,
          contact_type: 'email',
          subject: null,
          content: 'Hello',
          contact_date: '2024-01-15',
          next_follow_up_date: null,
          follow_up_completed_at: null,
          purpose: null,
          created_at: '2024-01-15T00:00:00Z',
          updated_at: '2024-01-15T00:00:00Z',
        },
      })
    );
  });

  it('sends an Idempotency-Key for contact creation', async () => {
    const { result } = renderHook(() =>
      useContactLogs({ clientId: undefined, autoFetch: false })
    );

    await act(async () => {
      await result.current.addContact({
        client_id: 'client-1',
        instrument_id: null,
        contact_type: 'email',
        subject: null,
        content: 'Hello',
        contact_date: '2024-01-15',
        next_follow_up_date: null,
        follow_up_completed_at: null,
        purpose: null,
      });
    });

    expect(apiFetch).toHaveBeenCalledWith(
      '/api/contacts',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
      expect.objectContaining({
        idempotencyKey: expect.stringMatching(/^contact-create:/),
      })
    );
  });
});
