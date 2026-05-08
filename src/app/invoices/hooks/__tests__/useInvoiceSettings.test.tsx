import { renderHook, waitFor } from '@/test-utils/render';
import { apiFetch } from '@/utils/apiFetch';
import { useInvoiceSettings } from '../useInvoiceSettings';

jest.mock('@/utils/apiFetch', () => ({
  apiFetch: jest.fn(),
}));

jest.mock('@/hooks/useTenantIdentity', () => ({
  useTenantIdentity: () => ({
    tenantIdentityKey: 'user:test-org:session',
    isTenantTransitioning: false,
  }),
}));

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

describe('useInvoiceSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads successful invoice settings from the shared API envelope', async () => {
    mockApiFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            business_name: 'HC Violins',
            address: '123 Main',
            phone: '555-0100',
            email: 'billing@example.com',
            default_currency: 'USD',
            default_exchange_rate: '1300',
          },
          success: true,
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      )
    );

    const { result } = renderHook(() => useInvoiceSettings());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.settings.business_name).toBe('HC Violins');
    });

    expect(result.current.settings.business_address).toBe('123 Main');
    expect(result.current.settings.business_phone).toBe('555-0100');
    expect(result.current.settings.business_email).toBe('billing@example.com');
    expect(result.current.settings.default_exchange_rate).toBe('1300');
    expect(result.current.error).toBeNull();
  });

  it('treats missing settings as defaults instead of a fatal load error', async () => {
    mockApiFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: null, success: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    const { result } = renderHook(() => useInvoiceSettings());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.settings.business_name).toBe('HC Violins');
    expect(result.current.settings.default_currency).toBe('USD');
    expect(result.current.error).toBeNull();
  });

  it('does not set a load error for aborted requests', async () => {
    mockApiFetch.mockRejectedValueOnce(
      new DOMException('Request aborted', 'AbortError')
    );

    const { result } = renderHook(() => useInvoiceSettings());

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalled();
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeNull();
  });
});
